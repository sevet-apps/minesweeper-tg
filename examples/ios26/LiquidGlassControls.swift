// Native SwiftUI reference for Xcode 26+ / iOS 26+.
// This file is not used by Spark's HTML/JavaScript Mini App.
// Synthesized from documented Apple APIs; not compiled on this Windows host.
// No API here claims to change the optical intensity/blur/refraction of Glass.
import SwiftUI

@available(iOS 26.0, *)
struct LiquidGlassControlsDemo: View {
    @State private var density = 0.45
    @State private var variant = NativeGlassVariant.regular
    @State private var taps = 0
    @State private var expanded = false
    @Namespace private var toolsNamespace
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.indigo, .blue, .cyan, .purple],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                // System buttons already supply their own interactive response.
                GlassEffectContainer(spacing: 16) {
                    HStack(spacing: 16) {
                        Button("Назад", systemImage: "chevron.left") { taps += 1 }
                            .buttonStyle(.glass)
                        Button("Продолжить", systemImage: "arrow.right") { taps += 1 }
                            .buttonStyle(.glassProminent)
                            .tint(.blue)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Picker("Системный вариант", selection: $variant) {
                        ForEach(NativeGlassVariant.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text("Плотность композиции: \(Int(density * 100))%")
                        .font(.headline)
                    Slider(value: $density, in: 0...1) {
                        Text("Плотность композиции")
                    } minimumValueLabel: {
                        Text("Легче")
                    } maximumValueLabel: {
                        Text("Плотнее")
                    }
                    Text("Ползунок меняет цвет tint и отдельную матовую подложку. Он не регулирует преломление или blur системного Glass.")
                        .font(.footnote)
                }
                .padding(20)
                .background(.background.opacity(0.9), in: RoundedRectangle(cornerRadius: 24))

                GlassEffectContainer(spacing: 16) {
                    ElasticNativeGlassButton(
                        variant: variant,
                        density: density,
                        reduceMotion: reduceMotion
                    ) {
                        taps += 1
                    }
                }
                // Keep this decorative drag demo outside a vertical ScrollView.
                // In a scrolling product, restrict custom drag to a dedicated handle.
                .frame(height: 80)

                Text("Нажатий: \(taps)")
                    .font(.headline)
                    .foregroundStyle(.white)

                // Independent regular-material morphing demonstration.
                GlassEffectContainer(spacing: 24) {
                    HStack(spacing: 24) {
                        Button(expanded ? "Скрыть" : "Инструменты", systemImage: "slider.horizontal.3") {
                            withAnimation(reduceMotion ? nil : .spring(duration: 0.5, bounce: 0.2)) {
                                expanded.toggle()
                            }
                        }
                        .buttonStyle(.glass)
                        .glassEffectID("tools", in: toolsNamespace)

                        if expanded {
                            Image(systemName: "paintpalette")
                                .font(.title2)
                                .frame(width: 56, height: 56)
                                .glassEffect(.regular, in: Circle())
                                .glassEffectID("palette", in: toolsNamespace)
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

@available(iOS 26.0, *)
private enum NativeGlassVariant: String, CaseIterable, Identifiable {
    case regular
    case clear

    var id: String { rawValue }
    var title: String { self == .regular ? "Regular" : "Clear" }
    var material: Glass { self == .regular ? .regular : .clear }
}

@available(iOS 26.0, *)
private struct ElasticNativeGlassButton: View {
    let variant: NativeGlassVariant
    let density: Double
    let reduceMotion: Bool
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @GestureState(resetTransaction: Transaction(animation: .spring(duration: 0.46, bounce: 0.26)))
    private var translation = CGSize.zero

    private var x: CGFloat { max(-50, min(50, translation.width)) }
    private var y: CGFloat { max(-35, min(35, translation.height)) }
    private var matteColor: Color {
        colorScheme == .dark
            ? Color(red: 0.08, green: 0.12, blue: 0.20)
            : .white
    }
    private var glass: Glass {
        variant.material
            .tint(Color.blue.opacity(0.08 + density * 0.45))
            .interactive()
    }

    var body: some View {
        Button(action: action) {
            Label("Потяни и отпусти", systemImage: "hand.draw")
                .font(.headline)
                .padding(.horizontal, 24)
                .padding(.vertical, 18)
                .contentShape(Capsule())
        }
        // Configurable native button style is public from iOS 26.0.
        // Don't also apply .glassEffect: that would double the material.
        .buttonStyle(.glass(glass))
        .buttonBorderShape(.capsule)
        .background {
            // Ordinary compositional backing, NOT a Glass intensity API.
            // Its alpha changes without fading the foreground label.
            Capsule().fill(matteColor.opacity(density * 0.72))
        }
        .scaleEffect(
            x: reduceMotion ? 1 : 1 + abs(x) / 600 - abs(y) / 1800,
            y: reduceMotion ? 1 : 1 + abs(y) / 600 - abs(x) / 1800
        )
        .offset(x: reduceMotion ? 0 : x * 0.18, y: reduceMotion ? 0 : y * 0.18)
        .highPriorityGesture(
            DragGesture(minimumDistance: 8, coordinateSpace: .global)
                .updating($translation) { value, state, transaction in
                    state = value.translation
                    // Follow the finger directly; spring only on automatic reset.
                    transaction.animation = nil
                }
        )
        .transaction { transaction in
            if reduceMotion { transaction.animation = nil }
        }
    }
}

