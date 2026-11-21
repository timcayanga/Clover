import ContactsUI
import ExpoModulesCore

private final class PickerDelegate: NSObject, CNContactPickerDelegate {
  var finish: (([String: String]?) -> Void)?
  func contactPickerDidCancel(_ picker: CNContactPickerViewController) { finish?(nil) }
  func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
    var result = ["name": CNContactFormatter.string(from: contact, style: .fullName) ?? contact.organizationName]
    result["email"] = contact.emailAddresses.first?.value as String?
    result["phone"] = contact.phoneNumbers.first?.value.stringValue
    finish?(result)
  }
}

public final class CloverContactPickerModule: Module {
  private var delegate: PickerDelegate?
  public func definition() -> ModuleDefinition {
    Name("CloverContactPicker")
    AsyncFunction("pick") { [self] (promise: Promise) in
      guard self.delegate == nil, let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_CONTACT_PICKER", "Unable to open Contacts.")
        return
      }
      let picker = CNContactPickerViewController()
      let delegate = PickerDelegate()
      self.delegate = delegate
      delegate.finish = { [weak self] result in
        self?.delegate = nil
        promise.resolve(result)
      }
      picker.delegate = delegate
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)
  }
}
