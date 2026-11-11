/** Preview builds are a local sandbox and must never touch production cloud data. */
export const remoteSyncAllowed = (preview = __PREVIEW__) => !preview

export const previewCloudError = () => new Error('В тестовой версии облачная синхронизация отключена')
