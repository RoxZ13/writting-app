import UIKit
import WebKit

final class ManuscriptWebView: WKWebView {
    private let manuscriptURL: URL
    private let emptyKeyboardAccessory = UIView(frame: .zero)

    init(manuscriptURL: URL) {
        self.manuscriptURL = manuscriptURL
        let configuration = WKWebViewConfiguration()
        if let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String {
            #if targetEnvironment(macCatalyst)
            configuration.applicationNameForUserAgent = "ManuscriptMac/\(build)"
            #else
            configuration.applicationNameForUserAgent = "ManuscriptIOS/\(build)"
            #endif
        }
        super.init(frame: .zero, configuration: configuration)
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override var inputAccessoryView: UIView? {
        guard let url,
              url.scheme == manuscriptURL.scheme,
              url.host == manuscriptURL.host,
              url.port == manuscriptURL.port,
              url.path == manuscriptURL.path else {
            return super.inputAccessoryView
        }

        // Supply an explicit accessory for the editor. UIKit can fall back to its form bar for nil.
        let route = url.fragment?.split(separator: "/").first
        return route == nil || route == "text" || route == "write" ? emptyKeyboardAccessory : super.inputAccessoryView
    }
}
