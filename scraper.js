import axios from 'axios';

// الدالة الرئيسية لجلب حديث عشوائي مع شرحه
const getRandomHadithWithExplanation = async () => {
    try {
        // 1. جلب قائمة الأقسام (categories) أولاً، ونفترض أن القسم الأول (id: 1) هو "الأربعون النووية"
        // بناءً على الوثائق، نستخدم الدالة getCategoriesList مع لغة عربية 'ar'
        const categoriesResponse = await axios.get('https://hadeethenc.com/api/v1/categories/list?language=ar');
        
        // التأكد من وجود الأقسام وأنها مصفوفة
        if (!categoriesResponse.data || !Array.isArray(categoriesResponse.data) || categoriesResponse.data.length === 0) {
            throw new Error('لم يتم العثور على أي أقسام للأحاديث.');
        }

        // نختار أول قسم، والذي غالباً ما يكون الأهم (مثل الأربعين النووية)
        const mainCategory = categoriesResponse.data[0];
        const categoryId = mainCategory.id;
        console.log(`📚 تم العثور على القسم: ${mainCategory.title}`);

        // 2. جلب قائمة بالأحاديث من هذا القسم (الصفحة الأولى، 20 حديثاً)
        // بناءً على الوثائق، نستخدم getHadeethsList مع parameters
        const hadeethsListResponse = await axios.get('https://hadeethenc.com/api/v1/hadeeths/list', {
            params: {
                language: 'ar',
                category_id: categoryId,
                page: 1,
                per_page: 50 // نجلب 50 حديثاً لنختار منهم عشوائياً
            }
        });

        // التأكد من وجود الأحاديث في المصفوفة 'data'
        const hadithsArray = hadeethsListResponse.data?.data;
        if (!hadithsArray || hadithsArray.length === 0) {
            throw new Error('لم يتم العثور على أحاديث في هذا القسم.');
        }

        // 3. اختيار حديث عشوائي من القائمة
        const randomIndex = Math.floor(Math.random() * hadithsArray.length);
        const randomHadithId = hadithsArray[randomIndex].id;
        console.log(`🆔 تم اختيار حديث عشوائي بالرقم: ${randomHadithId}`);

        // 4. جلب التفاصيل الكاملة (بما فيها الشرح) لذلك الحديث
        // بناءً على الوثائق، نستخدم getHadeethsOne
        const hadithDetailsResponse = await axios.get('https://hadeethenc.com/api/v1/hadeeths/one', {
            params: {
                language: 'ar',
                id: randomHadithId
            }
        });

        const hadith = hadithDetailsResponse.data;

        // 5. طباعة النتيجة مع الشرح
        console.log('\n' + '='.repeat(50));
        console.log(`📖 عنوان الحديث: ${hadith.title}`);
        console.log('='.repeat(50));
        console.log(`📝 متن الحديث:\n${hadith.hadeeth}`);
        console.log('\n' + '-'.repeat(30));
        console.log(`💡 شرح الحديث:\n${hadith.explanation}`);
        
        if (hadith.hints && hadith.hints.length > 0) {
            console.log('\n' + '-'.repeat(30));
            console.log(`📚 الفوائد المستنبطة:`);
            hadith.hints.forEach((hint, index) => {
                console.log(`${index + 1}. ${hint}`);
            });
        }
        
        if (hadith.words_meanings && hadith.words_meanings.length > 0) {
            console.log('\n' + '-'.repeat(30));
            console.log(`🔤 معاني الكلمات:`);
            hadith.words_meanings.forEach(item => {
                console.log(`• "${item.word}": ${item.meaning}`);
            });
        }

        console.log('\n' + '-'.repeat(30));
        console.log(`📜 المرجع: ${hadith.reference}`);
        console.log(`⭐ درجة الحديث: ${hadith.grade}`);
        console.log('='.repeat(50));

        return hadith;

    } catch (error) {
        console.error('❌ حدث خطأ:', error.message);
        if (error.response) {
            // هذا يعطينا تفاصيل أكثر عن الخطأ من الخادم نفسه
            console.error('تفاصيل من الخادم:', error.response.data);
        }
    }
};

// تشغيل الدالة
getRandomHadithWithExplanation();