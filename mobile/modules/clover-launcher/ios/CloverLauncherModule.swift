import ExpoModulesCore
import UIKit
import WidgetKit

private let quickActionChanged = Notification.Name("CloverLauncherQuickActionChanged")
private var pendingAction: String?

public final class CloverLauncherSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let prefix = "ph.clover.launcher."
    guard shortcutItem.type.hasPrefix(prefix) else {
      completionHandler(false)
      return
    }
    pendingAction = String(shortcutItem.type.dropFirst(prefix.count))
    NotificationCenter.default.post(name: quickActionChanged, object: nil)
    completionHandler(true)
  }
}

public final class CloverLauncherModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CloverLauncher")
    Events("quickAction")

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: quickActionChanged, object: nil, queue: .main
      ) { [weak self] _ in self?.sendEvent("quickAction") }
    }

    OnStopObserving {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }

    AsyncFunction("setWidgetSnapshot") { (value: String?) in
      guard let group = Bundle.main.object(forInfoDictionaryKey: "CloverWidgetGroup") as? String,
            let defaults = UserDefaults(suiteName: group) else { return }
      let previous = defaults.string(forKey: "snapshot")
      if let value {
        defaults.set(value, forKey: "snapshot")
        defaults.set(Date(), forKey: "snapshotDate")
      } else {
        for key in ["snapshot", "snapshotDate", "balanceIndex", "draft"] {
          defaults.removeObject(forKey: key)
        }
      }
      if previous != value || value == nil { WidgetCenter.shared.reloadAllTimelines() }
    }.runOnQueue(.main)

    AsyncFunction("consumeAction") { () -> String? in
      let action = pendingAction
      pendingAction = nil
      return action
    }.runOnQueue(.main)
  }
}
