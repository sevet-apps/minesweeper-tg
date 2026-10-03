# Liquid Glass: что реально доступно в API Apple

Проверено 4 октября 2026 года по публичной документации Apple, WWDC25 и WWDC26. Этот документ касается нативного SwiftUI/iOS 26+. Spark работает как HTML/JavaScript Telegram Mini App: `.glassEffect` нельзя вызвать из CSS или JavaScript. Экспериментальная настройка Spark — веб-имитация внешнего вида и взаимодействий, а не системный материал Apple.

## Настоящий системный материал

| Задача | Официальный публичный API | Что он действительно меняет |
| --- | --- | --- |
| Добавить стекло | `.glassEffect(_:in:)` | Материал за содержимым внутри заданной формы; по умолчанию `.regular` и капсула |
| Выбрать вариант | `Glass.regular`, `Glass.clear`, `Glass.identity` | Дискретный вариант; `identity` не применяет эффект |
| Задать цвет | `Glass.tint(Color?)` | Цвет стекла, а не коэффициент преломления |
| Ответ на касание/указатель | `Glass.interactive(Bool)` / `.interactive()` | Системные реакции: подсветка, увеличение и упругая реакция |
| Обычная/главная кнопка | `.buttonStyle(.glass)`, `.buttonStyle(.glassProminent)`; настраиваемая `.buttonStyle(.glass(Glass))` | Готовое системное оформление; у `.glass(Glass)` можно задать variant/tint |
| Группа соседних элементов | `GlassEffectContainer(spacing:)` | Общая область выборки фона, объединение близких форм |
| Морфинг | `.glassEffectID(_:in:)`, `.glassEffectTransition(_:)`, `.glassEffectUnion(id:namespace:)` | Координация стеклянных форм и переходов |

Перечень методов `Glass` содержит `tint` и `interactive`; документированных параметров `intensity`, `opacity`, `blurRadius`, `refraction`, `thickness` или `transparency` у `Glass` нет. У UIKit `UIGlassEffect` опубликованы стиль, `tintColor` и `isInteractive`, но самостоятельного регулятора оптической «силы стекла» также нет. Это вывод из опубликованной поверхности API, а не обещание, что такую возможность Apple никогда не добавит. [Glass](https://developer.apple.com/documentation/swiftui/glass), [UIGlassEffect](https://developer.apple.com/documentation/uikit/uiglasseffect).

`interactive()` не переносит кнопку по экрану и не даёт разработчику коэффициент растяжения. Для собственного жеста нужны `DragGesture`, `offset`/`scaleEffect` и анимация возврата. Системный отклик можно оставить, а дополнительное ограниченное растяжение выполнить отдельно. [WWDC25: Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/).

## Есть ли у Apple «ползунок стеклянности»

**Да, в материалах WWDC26 Apple уже объявила системный slider от ultra clear до fully tinted для поколения OS 27.** Он применяется к приложениям, ранее внедрившим Liquid Glass, автоматически при запуске на новых системах. Это настройка пользователя в системе; Apple не представила в изученной публичной поверхности `Glass` API, которым приложение задаёт собственное численное значение этого регулятора. [WWDC26 Keynote](https://developer.apple.com/videos/play/wwdc2026/101/), [WWDC26 Platforms State of the Union](https://developer.apple.com/videos/play/wwdc2026/102/).

Для поколения **iOS 26** руководство iPhone описывает **Display & Brightness → Liquid Glass → Clear / Tinted**: два варианта, Tinted даёт больше контраста и непрозрачности. Поэтому старый источник нельзя использовать, чтобы отрицать наличие нового slider в OS 27. Пользовательские режимы нельзя автоматически приравнивать к `Glass.clear` и `Glass.regular`: системная настройка и варианты разработческого материала — разные механизмы. [Apple Support: Adjust iPhone display and text settings](https://support.apple.com/en-gb/guide/iphone/iphd6804774e/ios).

Для собственного непрерывного регулятора внутри нативного приложения (включая совместимость с iOS 26) корректны следующие решения:

1. Отдельно выбирать `.regular` или `.clear`. Это настоящий системный вариант, без придуманной интерполяции между ними.
2. Менять alpha цвета, переданного в `.tint(Color.blue.opacity(value))`. Здесь `opacity` относится к `Color`: меняется входной цвет тонировки. Apple не обещает линейного соответствия между alpha цвета и прозрачностью/преломлением итогового материала. Этот slider следует называть «Насыщенность тонировки», если он регулирует только tint. [Glass.tint](https://developer.apple.com/documentation/swiftui/glass/tint(_:)), [Color.opacity](https://developer.apple.com/documentation/swiftui/color/opacity(_:)).
3. Для более заметной шкалы «Легче → Плотнее» менять непрозрачность **отдельной обычной подложки** за стеклом. Системный Liquid Glass сохраняется, а ощущение плотности регулирует дополнительная композиция. Это имитация интенсивности вокруг настоящего материала, не управление его внутренним оптическим движком.

`.opacity(value)` на всём `Button` ослабит и его текст/иконку. Если нужно менять только фон, применять прозрачность следует к отдельному фоновому слою. Это общий модификатор прозрачности `View`, а не параметр `Glass`. [View.opacity](https://developer.apple.com/documentation/swiftui/view/opacity(_:)).

`.blur(radius:)` размывает результат рисования самого view, включая его содержимое. Он не регулирует blur, используемый внутри Liquid Glass. Собственный shader через `distortionEffect` также остаётся собственным эффектом, а не открывает доступ к системному преломлению. [View.blur](https://developer.apple.com/documentation/swiftui/view/blur(radius:opaque:)), [Graphics and rendering modifiers](https://developer.apple.com/documentation/swiftui/view-graphics-and-rendering).

## Интерактивность, растяжение и пружина

Для обычного нажатия сначала подходит стандартная `.buttonStyle(.glass)` или настраиваемая `.buttonStyle(.glass(.regular.tint(...)))`: дополнительный собственный масштаб зачастую избыточен. Когда нужна отдельная декоративная деформация при перемещении пальца, `DragGesture` даёт translation; её можно ограничить, слегка сдвинуть и растянуть view. `@GestureState` автоматически сбрасывает временное состояние и при завершении, и при отмене жеста. `resetTransaction` позволяет задать пружинный возврат. [DragGesture](https://developer.apple.com/documentation/swiftui/draggesture), [GestureState resetTransaction](https://developer.apple.com/documentation/swiftui/gesturestate/init(wrappedvalue:resettransaction:)), [Adding interactivity with gestures](https://developer.apple.com/documentation/swiftui/adding-interactivity-with-gestures).

У `.spring(duration:bounce:blendDuration:)` `duration` задаёт воспринимаемый темп, `bounce` — колебания. Это общая анимация SwiftUI; она не меняет оптические свойства стекла. Для короткого jelly-возврата разумная исходная настройка — около 0,45 секунды и bounce 0,22–0,30, с последующей проверкой на устройстве. Числа — наше дизайнерское предложение, не норматив Apple. [Animation.spring](https://developer.apple.com/documentation/swiftui/animation/spring(duration:bounce:blendduration:)).

Настраиваемый стиль `.glass(Glass)` документирован и доступен с iOS 26.0: он предпочтительнее добавления сырого `.glassEffect` к обычной кнопке. [PrimitiveButtonStyle.glass(_:)](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glass(_:)), [WWDC26 SwiftUI Group Lab](https://developer.apple.com/videos/play/wwdc2026/8120/).

Готовый самостоятельный пример: [LiquidGlassControls.swift](../examples/ios26/LiquidGlassControls.swift). В нём есть стандартные glass-кнопки, переключение системного варианта, slider композиционной плотности, ограниченное растяжение с возвратом и морфинг. Код составлен из документированных API; **на Windows SwiftUI/Xcode недоступны, поэтому этот reference здесь не скомпилирован**. Перед переносом в нативный продукт требуется сборка Xcode 26+ и проверка жестов/контраста на iPhone.

## Официальные готовые примеры и дизайн

Apple публикует полноценный проект [Landmarks: Building an app with Liquid Glass](https://developer.apple.com/documentation/swiftui/landmarks-building-an-app-with-liquid-glass) с загрузкой исходников. Для кнопки и морфинга наиболее полезна его глава [Displaying custom activity badges](https://developer.apple.com/documentation/swiftui/landmarks-displaying-custom-activity-badges): контейнер, идентификаторы форм и расширение группы по нажатию. Это предпочтительнее сторонних примеров, которые лишь называют обычный blur стеклом.

Apple рекомендует `.regular` для большинства задач; `.clear` — для ярких элементов над визуально насыщенным медиа с подходящей подложкой. В одной группе не следует смешивать варианты и накладывать стекло на другое стекло. Accessibility Reduce Transparency, Increase Contrast и Reduce Motion системно меняют поведение нативного материала. [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

Контейнер важен не только для морфинга: соседние эффекты используют согласованную область фона. Apple отдельно предупреждает, что слишком много эффектов и контейнеров ухудшают производительность. [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views).

В Spark поэтому сохраняем исходный дизайн по умолчанию, применяем эксперимент только к управляющим поверхностям и не запускаем постоянную анимацию/преломление каждого элемента. Веб-slider регулирует доступные нам CSS-компоненты композиции: прозрачность подложки, контраст ободка, насыщенность и ограниченный backdrop blur. Он действительно меняет внешний вид сразу, но не представляет API Apple.

