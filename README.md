# TaskPilot

تطبيق React لإدارة المهام الذكية مع مصادقة Supabase، سياسات RLS، ولوحة Kanban عربية.

## التشغيل المحلي

1. شغل خادماً ثابتاً من جذر المشروع:

   ```powershell
   python -m http.server 5173
   ```

2. افتح:

   ```text
   http://localhost:5173
   ```

بدون إعداد Supabase يعمل التطبيق في وضع demo محلي باستخدام `localStorage`.

## ربط Supabase

1. أنشئ مشروع Supabase.
2. افتح SQL Editor وشغل محتوى `supabase/schema.sql`.
3. انسخ `config.example.js` إلى `config.js` وضع:

   ```js
   window.SUPABASE_CONFIG = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     anonKey: "YOUR_SUPABASE_ANON_KEY"
   };
   ```

4. من Authentication في Supabase فعّل Email/Password.

## الميزات

- تسجيل دخول وإنشاء حساب عبر Supabase Auth.
- عزل بيانات كل مستخدم بسياسات Row Level Security.
- إنشاء، تحديث، حذف، وفرز المهام حسب الحالة والأولوية.
- Smart Score محلي لكل مهمة حسب الموعد والأولوية والحالة.
- وضع demo محلي عند غياب مفاتيح Supabase.
