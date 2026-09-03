export function DemoPage() {
  return (
    <article className="demo-page" dir="rtl">
      <div className="mb-8 flex items-center justify-between text-xs tracking-widest text-indigo-600">
        <span>OWL INDUSTRIES</span>
        <span>اتفاقية خدمات</span>
      </div>
      <h1 className="mb-4 text-3xl font-semibold text-slate-900">عقد توريد وخدمات تقنية</h1>
      <p className="mb-4 leading-8 text-slate-700">
        تم الاتفاق بين الطرفين على تقديم الخدمات الموضحة في هذا المستند وفقًا للشروط والبنود التالية، ويُعد هذا العقد نافذًا من تاريخ التوقيع.
      </p>
      <p className="mb-8 text-left leading-7 text-slate-600" dir="ltr">
        This agreement defines the scope of work, delivery milestones, and the responsibilities of both parties.
      </p>
      <div className="grid grid-cols-[1.2fr_.8fr] gap-6" dir="ltr">
        <div className="h-36 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-400" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 7 }).map((_, index) => <div className="h-2 rounded-full bg-slate-200" key={index} />)}
        </div>
      </div>
      <div className="mt-12 border-t border-slate-200 pt-5 text-sm leading-7 text-slate-600">
        افتح ملف PDF أو أضف صورًا أو ابدأ المسح من اللوحة الجانبية. ستظهر نتيجة OCR هنا ويمكن مراجعتها قبل الحفظ.
      </div>
    </article>
  )
}
