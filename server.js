import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const books = {
    bukhari: { name: 'صحيح البخاري', api: 'bukhari' },
    muslim: { name: 'صحيح مسلم', api: 'muslim' },
    tirmizi: { name: 'سنن الترمذي', api: 'tirmizi' },
    nasai: { name: 'سنن النسائي', api: 'nasai' },
    ibnmajah: { name: 'سنن ابن ماجه', api: 'ibnmajah' },
    dawud: { name: 'سنن أبي داود', api: 'dawud' },
    nawawi: { name: 'الأربعون النووية', api: 'nawawi' }
};

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


const categoriesCache = { categories: null, fetchedAt: null };
const hadithsCache = { data: [], fetchedAt: null };
let favorites = [];

async function fetchCategories() {
    if (categoriesCache.categories && Date.now() - categoriesCache.fetchedAt < 3600000) {
        return categoriesCache.categories;
    }
    try {
        const response = await axios.get('https://hadeethenc.com/api/v1/categories/list?language=ar', { timeout: 10000 });
        categoriesCache.categories = response.data;
        categoriesCache.fetchedAt = Date.now();
        return response.data;
    } catch (error) {
        console.error('Error fetching categories:', error.message);
        return [];
    }
}

async function fetchHadithsFromCategory(categoryId, page = 1, perPage = 50) {
    try {
        const response = await axios.get('https://hadeethenc.com/api/v1/hadeeths/list', {
            params: { language: 'ar', category_id: categoryId, page, per_page: perPage },
            timeout: 15000
        });
        return response.data?.data || [];
    } catch (error) {
        console.error('Error fetching hadiths:', error.message);
        return [];
    }
}

async function fetchHadithDetails(hadithId) {
    try {
        const response = await axios.get('https://hadeethenc.com/api/v1/hadeeths/one', {
            params: { language: 'ar', id: hadithId },
            timeout: 10000
        }); 
        return response.data;
    } catch (error) {
        console.error('Error fetching hadith details:', error.message);
        return null;
    }
}

app.get('/api/books', (req, res) => {
    const booksList = Object.entries(books).map(([id, book]) => ({
        id,
        name: book.name,
        description: book.description
    }));
    res.json(booksList);
});

app.get('/api/categories', async (req, res) => {
    const categories = await fetchCategories();
    res.json(categories);
});

app.get('/api/hadiths', async (req, res) => {
    const { bookId, page = 1, perPage = 20 } = req.query;
    const categories = await fetchCategories();
    const book = books[bookId];
    
    if (!book) {
        return res.status(400).json({ error: 'الكتاب غير موجود' });
    }
    
    const category = categories.find(c => c.api === book.api);
    if (!category) {
        return res.status(404).json({ error: 'القسم غير موجود' });
    }
    
    const hadiths = await fetchHadithsFromCategory(category.id, parseInt(page), parseInt(perPage));
    res.json({ hadiths, total: hadiths.length, book: book.name });
});

app.get('/api/hadith/:id', async (req, res) => {
    const hadith = await fetchHadithDetails(req.params.id);
    if (hadith) {
        res.json(hadith);
    } else {
        res.status(404).json({ error: 'الحديث غير موجود' });
    }
});

app.get('/api/random', async (req, res) => {
    try {
        const categories = await fetchCategories();
        if (categories.length === 0) {
            return res.status(404).json({ error: 'لا توجد أقسام' });
        }
        
        const mainCategory = categories[Math.floor(Math.random() * Math.min(10, categories.length))];
        const hadiths = await fetchHadithsFromCategory(mainCategory.id, 1, 50);
        
        if (hadiths.length === 0) {
            return res.status(404).json({ error: 'لا توجد أحاديث' });
        }
        
        const randomHadith = hadiths[Math.floor(Math.random() * hadiths.length)];
        const details = await fetchHadithDetails(randomHadith.id);
        
        res.json(details || randomHadith);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ results: [] });
    
    try {
        const categories = await fetchCategories();
        const allHadiths = [];
        
        for (let i = 0; i < Math.min(5, categories.length); i++) {
            const hadiths = await fetchHadithsFromCategory(categories[i].id, 1, 30);
            allHadiths.push(...hadiths);
        }
        
        const results = allHadiths.filter(h => 
            (h.hadeeth && h.hadeeth.toLowerCase().includes(q.toLowerCase())) ||
            (h.narrator && h.narrator.toLowerCase().includes(q.toLowerCase()))
        );
        
        res.json({ results: results.slice(0, 20) });
    } catch (error) {
        res.json({ results: [] });
    }
});

async function getTotalCount() {
    try {
        const categories = await fetchCategories();
        let total = 0;
        for (const cat of categories.slice(0, 3)) {
            const hadiths = await fetchHadithsFromCategory(cat.id, 1, 1);
            total += hadiths.length;
        }
        return total;
    } catch {
        return 0;
    }
}

app.get('/api/stats', async (req, res) => {
    const total = await getTotalCount();
    res.json({ total, lastScraped: null, favorites: favorites.length });
});

// ========== إدارة حديث كل 5 ساعات ==========
export let periodicHadith = null;
const periodicCallbacks = [];

export function onPeriodicUpdate(callback) {
    periodicCallbacks.push(callback);
}

async function updatePeriodicHadith() {
    try {
        const categories = await fetchCategories();
        if (categories.length === 0) return;
        
        let attempts = 0;
        let randomHadith = null;
        let details = null;
        
        while(attempts < 10 && !details) {
            attempts++;
            const mainCategory = categories[Math.floor(Math.random() * Math.min(10, categories.length))];
            const hadiths = await fetchHadithsFromCategory(mainCategory.id, 1, 50);
            if(hadiths.length > 0) {
                randomHadith = hadiths[Math.floor(Math.random() * hadiths.length)];
                details = await fetchHadithDetails(randomHadith.id);
            }
        }
        
        if (details || randomHadith) {
            periodicHadith = details || randomHadith;
            console.log(`\n🔄 تم تحديث حديث الـ 5 ساعات: ${periodicHadith.title || 'حديث جديد'}\n`);
            periodicCallbacks.forEach(cb => cb(periodicHadith));
        }
    } catch (error) {
        console.error('Error updating periodic hadith:', error.message);
    }
}

// تحديث كل 5 ساعات
setInterval(updatePeriodicHadith, 5 * 60 * 60 * 1000);
// وتحديث فوري عند بداية تشغيل الخادم بقليل
setTimeout(updatePeriodicHadith, 2000);

app.get('/api/periodic', (req, res) => {
    if (periodicHadith) {
        res.json(periodicHadith);
    } else {
        res.status(404).json({ error: 'الحديث غير متوفر حالياً، يرجى المحاولة بعد قليل' });
    }
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║   🚀 الخادم يعمل على http://localhost:${PORT}   ║
║                                          ║
╚══════════════════════════════════════════╝
    `);
});