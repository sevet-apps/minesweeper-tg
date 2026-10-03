# Проверенные GitHub-примеры Liquid Glass

Проверено 4 октября 2026 года: README, текущие Swift-исходники, Package.swift/проект, лицензия и последний коммит. Это чтение кода, а не подтверждение сборки на устройстве: SwiftUI/Xcode в этой Windows-среде не запускаются. Нативные SwiftUI-компоненты не работают внутри Telegram WebView; для Spark они служат техническими и визуальными ориентирами.

## Подборка

| Проект | Для чего полезен | Настоящий Liquid Glass | Требования и лицензия |
| --- | --- | --- | --- |
| [iOS-26-by-Examples](https://github.com/artemnovichkov/iOS-26-by-Examples) | Минимальный перетаскиваемый стеклянный элемент, переключение interactive | Да, `.glassEffect(.regular.interactive(...))` | iOS 26+, Xcode 26; MIT |
| [LiquidGlassSwiftUI](https://github.com/mertozseven/LiquidGlassSwiftUI) | Раскрывающаяся группа кнопок, shared IDs, смена символов | Да, `.clear.interactive()`, контейнер/ID | iOS 26+, Xcode 26; LICENSE отсутствует |
| [Glass_Effect_SwiftUI](https://github.com/ahmetbostanciklioglu/Glass_Effect_SwiftUI) | Слияние нескольких поверхностей в капсулу и раскрытие меню | Да, `.glassEffectUnion`, `.buttonStyle(.glass)` | Проект заявляет iOS 26.1+, Xcode 26; LICENSE отсутствует |
| [Scrubbers](https://github.com/haplollc/Scrubbers) | Деформация lens по скорости, упругое растяжение и jelly-ползунки | Стиль `.glass`: нативная поверхность на iOS 26; elastic/jelly — авторская геометрия | Пакет iOS 17+, Swift 6.0; для native glass нужен SDK 26; MIT |
| [metneo/LiquidGlass](https://github.com/metneo/LiquidGlass) | Адаптер native/fallback, готовые кнопки и переключатели; проверка границ opacity | На 26+ нативный путь; раньше имитация | Пакет iOS 16+ / Swift 5.9+, native требует SDK 26; MIT |
| [rguillen-dev/LiquidGlass](https://github.com/rguillen-dev/LiquidGlass) | Готовые ButtonStyle, адаптация к Reduce Motion / Reduce Transparency | Поверхность на 26+ нативная; часть morphing принудительно заменена fallback | iOS 17+, Swift 6.0; native с компилятором 6.2+/SDK 26; MIT |

Отсутствие LICENSE означает, что публичный просмотр репозитория сам по себе не даёт разрешения копировать его код в продукт. Такие проекты здесь — примеры поведения и структуры; для Spark их код не переносился.

## Что именно проверено в коде

### 1. Artem Novichkov: базовый drag

[GlassEffectView.swift](https://github.com/artemnovichkov/iOS-26-by-Examples/blob/3925d51bd4a22893848448f8a3ea096f1b363dde/iOS-26-by-Examples/Views/GlassEffectView.swift) задаёт стекло через `.regular.interactive(isInteractive)` и меняет положение через `DragGesture.onChanged`. Переключатель позволяет сравнить реакцию материала. Это хороший минимальный пример настоящего системного стекла, но в нём нет собственного растягивания геометрии и spring-возврата после отпускания. Последний коммит: `3925d51`, 28.12.2025. [MIT](https://github.com/artemnovichkov/iOS-26-by-Examples/blob/3925d51bd4a22893848448f8a3ea096f1b363dde/LICENSE).

### 2. Mert Ozseven: интерактивные кнопки и раскрытие

[ActionButtonsView.swift](https://github.com/mertozseven/LiquidGlassSwiftUI/blob/6e1caf2463b04bf9c88e739848f83aae99a0b55f/LiquidGlassExample/Scenes/Main/Views/ActionButtonsView.swift) использует `GlassEffectContainer(spacing: 20)`, `@Namespace`, `glassEffectID` и добавляет/убирает группу действий внутри `withAnimation`. В [View+Extension.swift](https://github.com/mertozseven/LiquidGlassSwiftUI/blob/6e1caf2463b04bf9c88e739848f83aae99a0b55f/LiquidGlassExample/Utilities/Extensions/View%2BExtension.swift) кнопкам назначено `.glassEffect(.clear.interactive())`. [ExpandedActionsView.swift](https://github.com/mertozseven/LiquidGlassSwiftUI/blob/6e1caf2463b04bf9c88e739848f83aae99a0b55f/LiquidGlassExample/Scenes/Main/Views/ExpandedActionsView.swift) показывает отдельные стеклянные Share/Save/Like и плавную замену символов. Последний коммит: `6e1caf2`, 14.08.2025; явной лицензии нет. Растягивание за пальцем здесь не реализовано.

### 3. Ahmet Bostancıklıoğlu: объединение стекла

[GlassEffectContainerView.swift](https://github.com/ahmetbostanciklioglu/Glass_Effect_SwiftUI/blob/d4510614a3c74e529e2825724b08de39366d2188/GlassEffectContainer/View/GlassEffectContainerView.swift) объединяет два элемента через `glassEffectUnion(id:namespace:)`; служебная кнопка использует штатный `.glass`. Раскрытие — `.smooth(duration: 1, extraBounce: 0)`. Это пример morphing материала, а не физики упругого drag. Последний коммит: `d451061`, 02.07.2026. [README и заявленные требования](https://github.com/ahmetbostanciklioglu/Glass_Effect_SwiftUI/tree/d4510614a3c74e529e2825724b08de39366d2188): iOS 26.1+, Xcode 26; явной лицензии нет.

### 4. Haplo: самый полезный пример stretch/jelly

[GlassFace.swift](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/Sources/Scrubbers/Styles/GlassFace.swift) на iOS 26 использует `.glassEffect(.clear, in: Capsule())`. Пока пользователь держит ползунок, ручка расширяется в линзу; её размеры зависят от скорости, а центральное увеличение дорожки нарисовано самим компонентом. Системная оптика и авторское увеличение — разные слои. Прозрачность слоя при появлении линзы не регулирует внутреннюю интенсивность Apple Glass.

[Scrubber.swift](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/Sources/Scrubbers/Scrubber.swift) содержит `DragGesture(minimumDistance: 0)` и возврат/инерцию через spring. [ElasticFace.swift](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/Sources/Scrubbers/Styles/ElasticFace.swift) ограничивает растяжение дорожки и уменьшает толщину при удлинении. [JellyFace.swift](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/Sources/Scrubbers/Styles/JellyFace.swift) — Canvas и цепочка точек с Verlet-интеграцией. При успокоении симуляция прекращается, Reduce Motion убирает колебания. Последний коммит: `b6e1857`, 28.09.2026. [Package.swift](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/Package.swift), [MIT](https://github.com/haplollc/Scrubbers/blob/b6e1857a3265c5cba6b97093fdc2da4861d33325/LICENSE).

### 5. metneo: почему чужой opacity не доказывает API Apple

В публичном API пакета есть `liquidGlass(..., opacity: ...)`, но [GlassEffectModifier.swift](https://github.com/metneo/LiquidGlass/blob/36f81c85922aa3475b7e5bb210e69ffe20a2b377/Sources/LiquidGlass/View/Supporting/GlassEffectModifier.swift) показывает принципиальную разницу: native-путь вызывает `glassEffect(in:)` и `tint`, **не передавая opacity**. Значение opacity используется только в авторском fallback. Таким параметром нельзя регулировать «силу» настоящего материала на iOS 26.

[GlassButtonStyle.swift](https://github.com/metneo/LiquidGlass/blob/36f81c85922aa3475b7e5bb210e69ffe20a2b377/Sources/LiquidGlass/View/Control/GlassButtonStyle.swift) на новых ОС применяет `.glass`/`.glassProminent`, а старые используют самодельную поверхность. Последний коммит: `36f81c8`, 14.09.2026. [MIT](https://github.com/metneo/LiquidGlass/blob/36f81c85922aa3475b7e5bb210e69ffe20a2b377/LICENSE).

### 6. Ricardo Guillen: готовые компоненты с ограничением morphing

[GlassButton.swift](https://github.com/rguillen-dev/LiquidGlass/blob/4b5519f647dc384874fbf4ef70a9a60c4352dc2e/Sources/LiquidGlass/GlassButton.swift) добавляет нажатие через `configuration.isPressed`, масштаб 0.96, dimming и `easeOut(0.15)`; это простой press-feedback, **не jelly/spring**. Reduce Motion отключает масштаб. [GlassMaterial.swift](https://github.com/rguillen-dev/LiquidGlass/blob/4b5519f647dc384874fbf4ef70a9a60c4352dc2e/Sources/LiquidGlass/GlassMaterial.swift) напрямую вызывает `.regular.tint(...)` на iOS 26+ и содержит `nativeGlassMorphingEnabled = false`. Автор объясняет отключение контейнерного morphing проблемой рендеринга на реальном устройстве; это сообщение автора, а не подтверждённая Apple неисправность всех приложений. Последний коммит: `4b5519f`, 19.09.2026. [MIT](https://github.com/rguillen-dev/LiquidGlass/blob/4b5519f647dc384874fbf4ef70a9a60c4352dc2e/LICENSE).

## Выбор для Spark

Для будущей нативной версии опираться непосредственно на публичные API Apple, минимальный drag-пример Artem и авторскую ограниченную геометрию/spring по образцу Scrubbers. `.interactive()` — системная реакция материала; контролируемое растягивание, ограничение смещения и возврат кнопки задаются приложением.

Для нынешнего веб-приложения — отдельная лёгкая имитация, без переноса Swift-пакетов и без утверждения, что CSS запускает системный Liquid Glass. Регулятор меняет параметры нашей поверхности; при выключенном экспериментальном режиме сохраняется обычный дизайн. Постоянную физическую симуляцию на каждой кнопке не использовать: реагировать только на активное касание и прекращать анимацию после затухания.
