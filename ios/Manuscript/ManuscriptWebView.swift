import UIKit
import WebKit

final class ManuscriptWebView: WKWebView {
    private let manuscriptURL: URL

    init(manuscriptURL: URL) {
        self.manuscriptURL = manuscriptURL
        super.init(frame: .zero, configuration: WKWebViewConfiguration())
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

        // The writing route uses a document editor, where Next/Previous fields are unnecessary.
        let route = url.fragment?.split(separator: "/").first
        return route == nil || route == "text" || route == "write" ? nil : super.inputAccessoryView
    }
}
