import UIKit
import WebKit

final class ManuscriptViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let home = URL(string: "https://roxz13.github.io/writting-app/")!
    private lazy var web = ManuscriptWebView(manuscriptURL: home)
    private let retry = UIButton(type: .system)
    private let cancelSignIn = UIButton(type: .system)
    private var signInInProgress = false
    private var downloads: [ObjectIdentifier: URL] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        web.translatesAutoresizingMaskIntoConstraints = false
        web.navigationDelegate = self
        web.uiDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.keyboardDismissMode = .interactive
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        retry.setTitle("Повторить загрузку Manuscript", for: .normal)
        retry.addTarget(self, action: #selector(loadHome), for: .touchUpInside)
        cancelSignIn.setTitle("Отменить вход", for: .normal)
        cancelSignIn.addTarget(self, action: #selector(loadHome), for: .touchUpInside)
        cancelSignIn.backgroundColor = .systemBackground
        for button in [retry, cancelSignIn] {
            button.translatesAutoresizingMaskIntoConstraints = false
            button.isHidden = true
            view.addSubview(button)
        }
        NSLayoutConstraint.activate([
            retry.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            retry.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            cancelSignIn.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            cancelSignIn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            cancelSignIn.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            cancelSignIn.widthAnchor.constraint(greaterThanOrEqualToConstant: 140),
        ])
        loadHome()
    }

    @objc private func loadHome() {
        web.stopLoading()
        signInInProgress = false
        cancelSignIn.isHidden = true
        retry.isHidden = true
        web.isHidden = false
        web.load(URLRequest(url: home))
    }

    private func isManuscript(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == home.host && url.port == nil && url.path == home.path
    }

    private func isYandexSignInPage(_ url: URL) -> Bool {
        guard url.scheme == "https", url.port == nil, let host = url.host else { return false }
        return ["oauth.yandex.ru", "passport.yandex.ru", "id.yandex.ru", "ya.ru"].contains(host)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if action.shouldPerformDownload, action.sourceFrame.isMainFrame,
           action.sourceFrame.request.url.map(isManuscript) == true {
            decisionHandler(.download)
            return
        }
        if action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }
        if isManuscript(url) {
            signInInProgress = false
            cancelSignIn.isHidden = true
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        // The web app already validates the single-use OAuth state on the registered HTTPS callback.
        let callback = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "redirect_uri" })?.value
        let beginsSignIn = url.host == "oauth.yandex.ru" && url.path == "/authorize" && callback == home.absoluteString
        if isYandexSignInPage(url), signInInProgress || beginsSignIn {
            signInInProgress = true
            cancelSignIn.isHidden = false
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        decisionHandler(.cancel)
        if action.navigationType == .linkActivated && ["https", "http", "mailto"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        web.isHidden = true
        retry.isHidden = false
        cancelSignIn.isHidden = true
    }

    private func showLoadFailure(_ error: Error) {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        // WebKit reports a policy interruption when a navigation becomes a download.
        if error.domain == "WebKitErrorDomain" && error.code == 102 { return }
        webViewWebContentProcessDidTerminate(web)
    }

    // WebKit delegates the web app's confirm(), alert() and prompt() to the host app.
    func webView(
        _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void
    ) {
        guard canPresentDialog(for: frame) else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Подтвердить", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void
    ) {
        guard canPresentDialog(for: frame) else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void
    ) {
        guard canPresentDialog(for: frame) else { completionHandler(nil); return }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    private func canPresentDialog(for frame: WKFrameInfo) -> Bool {
        frame.isMainFrame && frame.request.url.map(isManuscript) == true && presentedViewController == nil
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(
        _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let name = (suggestedFilename as NSString).lastPathComponent
        guard !name.isEmpty, name != ".", name != ".." else { completionHandler(nil); return }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            let file = directory.appendingPathComponent(name)
            downloads[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch {
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = web
        share.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        let presenter = presentedViewController ?? self
        presenter.present(share, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Не удалось скачать файл", message: "Попробуй экспортировать ещё раз.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
