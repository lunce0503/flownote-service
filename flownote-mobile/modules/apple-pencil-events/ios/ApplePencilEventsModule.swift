import ExpoModulesCore
import UIKit

public final class ApplePencilEventsModule: Module, UIPencilInteractionDelegate {
  private weak var attachedView: UIView?
  private var pencilInteraction: UIPencilInteraction?
  private var lastTapUptime: TimeInterval = 0

  public func definition() -> ModuleDefinition {
    Name("ApplePencilEvents")
    Events("onDoubleTap")

    OnStartObserving("onDoubleTap") {
      self.installInteraction()
    }
    OnStopObserving("onDoubleTap") {
      self.removeInteraction()
    }
    OnDestroy {
      self.removeInteraction()
    }
  }

  private func installInteraction() {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.pencilInteraction == nil, let view = Self.activeRootView() else { return }
      let interaction = UIPencilInteraction()
      interaction.delegate = self
      interaction.isEnabled = true
      view.addInteraction(interaction)
      self.attachedView = view
      self.pencilInteraction = interaction
    }
  }

  private func removeInteraction() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if let interaction = self.pencilInteraction {
        self.attachedView?.removeInteraction(interaction)
      }
      self.pencilInteraction = nil
      self.attachedView = nil
    }
  }

  private static func activeRootView() -> UIView? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    let window = windows.first(where: \.isKeyWindow) ?? windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController { controller = presented }
    return controller?.view ?? window
  }

  private func emitDoubleTap() {
    let uptime = ProcessInfo.processInfo.systemUptime
    guard uptime - lastTapUptime > 0.15 else { return }
    lastTapUptime = uptime
    let action: String
    switch UIPencilInteraction.preferredTapAction {
    case .switchEraser: action = "switchEraser"
    case .switchPrevious: action = "switchPrevious"
    case .showColorPalette: action = "showColorPalette"
    case .ignore: action = "ignore"
    @unknown default: action = "unknown"
    }
    sendEvent("onDoubleTap", ["action": action])
  }

  public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
    emitDoubleTap()
  }

  @available(iOS 17.5, *)
  public func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
    emitDoubleTap()
  }
}
