# 🗺️ PROJECT MAP: dress-rental-business-management

**Generated:** 2026-11-17 13:10:55

> **Note:** This map shows the project structure and code signatures (classes, functions, methods).
> Run `python3 dev_tools/generate_repo_map.py` to regenerate after significant changes.

---

## 📁 / (root)
- 📄 .gitignore
- 📄 ARCHITECTURE.md
- 📄 CHANGELOG.md
- 📄 CONTRIBUTING.md
- 📄 LICENSE
- 📄 PROJECT_MAP.md
- 📄 README.md
- 📄 SECURITY.md
- 📄 SETUP.md
- 📄 env.example
- 📄 package.json

### 📁 apps_script/
  #### 📄 Code.js
  ```
  function doPost(e)
  function processPayload(payload)
  function handleSendEmail(payload)
  function getPaymentMethodLabel(method)
  function getBackendUrl()
  function log(level, action, message, details = null)
  function flushLogs()
  function normalizePhone(value)
  function getItemTypeLabel(type)
  function handleWeddingCalendar(data)
  function handleWeddingTask(data)
  function handleCalendarEvent(payload)
  function handleTask(payload)
  function findOrCreateTaskList(listName)
  function handleSheetsAppend(payload)
  function handleDriveUpload(payload, message)
  function findOrCreateFolder(parentFolder, folderName)
  function extractReceiptData(fileBlob, paymentMethod)
  function getReceiptSummaryText(receipt)
  function buildReceiptRowsHtml(receipt)
  function buildReceiptPdfBlob(pdfBase64, fileName)
  function handleIncomeDetailed(payload)
  function handleOrderNotification(payload)
  function getMimeTypeFromFilename(filename)
  function handleNotificationGeneric(payload, type)
  function uploadFileToDrive(base64Data, fileName, folderPath)
  function handleDriveRename(payload)
  function handleOrderUpdate(payload)
  function getHebrewDate(date)
  function sendErrorNotification(error)
  function testDoPost()
  ```
  - 📄 Secrets.js.example
  - 📄 appsscript.json

### 📁 backend/
  - 📄 package.json

  ### 📁 src/
    #### 📄 index.js
    ```
      const runReceiptRecovery = () =>
    function shutdown()
    ```

    ### 📁 config/
      #### 📄 index.js
      *(no signatures found)*

    ### 📁 constants/
      #### 📄 agreementTerms.js
      ```
      export function hasRentalItems(items)
      export function getTermsForOrder(items)
      ```

    ### 📁 db/
      #### 📄 database.js
      ```
      export function run(sql, params = [])
      export function get(sql, params = [])
      export function all(sql, params = [])
      export function transaction(fn)
      export function close()
      ```
      #### 📄 migrate.js
      *(no signatures found)*
      #### 📄 schema.js
      *(no signatures found)*

    ### 📁 middleware/
      #### 📄 activityLogger.js
      ```
      export function requestLogger(req, res, next)
      export function errorLogger(err, req, res, next)
      ```
      #### 📄 auth.js
      ```
      function clearAuthCookie(res)
      export function requireAuth(req, res, next)
      export function optionalAuth(req, res, next)
      export function requireAdmin(req, res, next)
      export function generateToken(userId)
      ```
      #### 📄 errorHandler.js
      ```
      function redactSecrets(value, depth = 0)
      export class ApiError extends Error
        constructor(statusCode, message, details = null)()
      export function notFoundHandler(req, res, next)
      export function errorHandler(err, req, res, next)
      ```
      #### 📄 loginProtection.js
      *(no signatures found)*

    ### 📁 routes/
      #### 📄 agreements.js
      ```
      function getOrderForAgreement(orderId)
      function createAgreementToken(orderId, eventDateStr)
      function resolveAgreementToken(token)
      async function reencodeSignaturePng(signatureData)
      function buildAgreementPrefillPayload(orderWithItems)
      function getLatestAgreementForOrder(orderId)
      function hasSignedAgreementForCurrentOrderVersion(orderId)
      function resolvePublicFrontendBaseUrl()
      function cleanForFilename(value)
      function saveAgreementPdfToLocalUploads(pdfBuffer, customerName, orderId = null)
      ```
      #### 📄 apps-script-logs.js
      ```
      function getDateString()
      function secretMatches(presented, expected)
      function requireGasSecret(req, res, next)
      function oneLine(value, max)
      function buildLogLine(raw)
      ```
      #### 📄 auth.js
      ```
      function parseExpiresInToMs(expiresIn)
      ```
      #### 📄 client-errors.js
      ```
      function isRateLimited(ip)
      ```
      #### 📄 customers.js
      *(no signatures found)*
      #### 📄 dashboard.js
      *(no signatures found)*
      #### 📄 dresses.js
      ```
      function normalizeUploadedImagePath(value)
      ```
      #### 📄 export.js
      ```
      function createDateFilters(column, fromLabel = 'מתאריך', toLabel = 'עד תאריך')
      function getQueryValue(query, key)
      function splitValues(rawValue)
      function normalizeText(rawValue)
      function parseInteger(rawValue, label)
      function parseDate(rawValue, label)
      function parseBoolean(rawValue, label)
      function validateAllowedValues(filter, values)
      function applyFilter(filter, rawValue, whereClauses, params)
      function escapeCsvValue(value)
      function rowsToCsv(rows, columns)
      function buildDatasetMeta(datasetKey, config)
      ```
      #### 📄 order-attachments.js
      ```
      function uploadFilesWithFriendlyErrors(req, res, next)
      function ensureOrderDir(orderId)
      function assertOrderExists(orderId)
      ```
      #### 📄 orders.js
      ```
      function getMimeTypeFromFileName(fileName = '')
      function getItemTypeLabel(type)
      function syncDressSaleStatus(dressId)
      function recomputeDressIncomeAndCount(dressId)
      function removeOrderDressHistory(orderId)
      ```
      #### 📄 push.js
      *(no signatures found)*
      #### 📄 receipts.js
      ```
      async function sendReceiptPdf(res, receipt)
      ```
      #### 📄 transactions.js
      ```
      function recomputeOrderPaidAmount(orderId)
      function getCategoryDisplayName(category)
      function normalizeBankDetails(value)
                    const formatFileName = (d, s, a, ext = '.jpg') =>
      ```

    ### 📁 scripts/
      #### 📄 create-admin.js
      ```
      const question = (prompt) =>
      async function createAdmin()
      ```
      #### 📄 import-dresses.js
      *(no signatures found)*
      #### 📄 quick-update-admin.js
      ```
      async function updateAdmin()
      ```
      #### 📄 update-admin.js
      ```
      const question = (prompt) =>
      async function updateAdmin()
      ```

    ### 📁 services/
      #### 📄 ai.js
      ```
      function buildGenerateUrl(modelName)
      function buildModelsListUrl()
      async function getAvailableModels()
      async function resolveModelsToTry()
      function isRetryableModelError(payload, httpStatus)
      export async function extractReceiptDetails(fileBuffer, mimeType, expectedPaymentMethod = null)
                const pick = (...keys) =>
      ```
      #### 📄 email.js
      ```
      export function isEmailEnabled()
      async function postToAppsScriptWebApp(payload)
      async function sendEmail(options)
      function escapeHtml(value)
      export function buildReceiptEmailHtml({ customerName, documentNumber, amount, issuedDate, description })
        const row = (label, value, strong = false) =>
      export async function sendReceiptToCustomer({ to, customerName, documentNumber, amount, issuedDate, description, pdfBuffer, fileName })
      function formatDateHebrew(date)
      function createWhatsAppLink(phone, message = '')
      export async function testEmailConnection()
      export async function sendToAppsScript(payload)
      export async function sendCalendarEvent({ title, date, allDay = true })
      export async function sendTaskToGoogle({ listName = 'לקוחות', title, dueDate })
      export async function sendFileToDrive({ fileName, folder, fileBuffer, mimeType })
      export async function sendDriveRename({ oldFolder, oldFileName, newFolder, newFileName })
      export async function sendOrderUpdate({ oldCustomerName, oldEventDate, newCustomerName, newEventDate, newOrderSummary })
      export async function sendToEmailList({ email, name })
      ```
      #### 📄 image.js
      ```
      export async function processDressImage(buffer)
      ```
      #### 📄 localStorage.js
      ```
      function ensureDirectoryExists(dirPath)
      export function getSyncedFolderPath()
      export function getExpensesFolderPath()
      export function getAgreementsFolderPath()
      export function getExpenseCategories(year = new Date().getFullYear())
      function cleanForFilename(str)
      function formatDateYYMMDD(date = new Date())
      export function saveExpenseReceipt(receiptData, category, description, supplier, amount, expenseDate = new Date(), extension = 'jpg')
      export function saveAgreementPdf(pdfBuffer, customerName, agreementDate = new Date(), orderId = null)
      export function isExpensesFolderAccessible()
      export function isAgreementsFolderAccessible()
      export function isSyncedFolderAccessible()
      export function listFilesInFolder(folderPath)
      ```
      #### 📄 logger.js
      ```
      function getDateString()
      function getTimestamp()
      function formatLogEntry(level, category, action, data)
      function writeToDailyLog(entry)
      function writeToErrorLog(entry)
      function writeToCombinedLog(entry)
      function cleanupOldLogs()
      function writeToFiles(level, category, action, data)
      function extractHost(value)
      function buildFrontendHosts()
      function isFromFrontendLink(data)
        const matchesFrontend = (candidate) =>
      function shouldSendTelegramAlert(data)
      export function logUserAction(req, action, category, entityType = null, entityId = null, entityName = null, details = null)
      export function logError(req, error, category = LogCategory.ERROR)
      export function logLogin(email, success, userId = null, userName = null, ipAddress = null, userAgent = null, errorMessage = null, reqContext = {})
      ```
      #### 📄 paymentDetails.js
      ```
      function normalizeText(value)
      function toMethodCode(value)
      function normalizeInstallments(value)
      function normalizeLastFourDigits(value)
      function toBankDetailsObject(value)
      function serializeBankDetails(value)
      export function normalizeMethodCode(value)
      ```
      #### 📄 pdfGenerator.js
      ```
      function escapeHtml(value)
      function sanitize(value, fallback = '-')
      function formatDateHebrew(dateStr)
      function formatCurrency(amount)
      function translateItemType(type)
      function resolveChromePath()
      function loadLogoDataUrl()
      function buildAgreementHtml(agreementData)
      async function generateWithChrome(htmlContent)
      export async function generateAgreementPdf(agreementData)
      ```
      #### 📄 phone.js
      ```
      export function normalizePhoneNumber(value)
      ```
      #### 📄 pushNotifications.js
      ```
      function createWhatsAppLink(phone, message)
      export async function sendPushNotification(subscription, payload)
      function calculateDateDiffs(eventDateStr, todayStr)
      export async function sendReturnReminders()
      ```
      #### 📄 receipts.js
      ```
      const driveIncomeFolder = (year) =>
      export function toSmartInvoiceMethod(appMethod)
      function fallbackMethodLabel(appMethod)
      export function waitForReceiptFollowUps(receiptId)
      export function getReceiptsStatus()
      export function getDefaultReceiptDescription(category)
      export function parseReceiptRequest(value, category)
      export function getCustomerReceiptName(customerId)
      export function saveCustomerReceiptName(customerId, receiptName)
      function parseBankDetails(value)
      export function buildPaymentReference(transaction)
      export function requestReceipt(transactionId, { description, notes })
      export function isObsoleteTestReceipt(receipt)
      export function getVisibleReceiptByTransactionId(transactionId)
      export function isStuckPending(receipt)
      export function getReceiptById(id)
      export function getReceiptByTransactionId(transactionId)
      function markFailed(receipt, code, message, { consumeKey, technicalDetail = null, outage = false })
      function alertReceiptNotIssued(receiptId, reason, { outage = false } = {})
      function alertDriveSaveFailed(receipt, reason)
      function heMessage(code, fallback)
      function describeNetworkError(error, timeoutMs = smartInvoiceConfig.timeoutMs)
      async function callSmartInvoice(method, path, { body, idempotencyKey, raw = false } = {})
      export async function issueReceipt(receiptId, { waitForFollowUps = true } = {})
      async function issueReceiptNow(receiptId)
      function documentNumberOf(document)
      async function completeIssuedReceipt(receipt, transaction, { documentId, documentNumber, pdfUrl, adopted })
        const followUps = (async () =>
      async function emailReceiptToCustomer(receipt, email)
        const fail = (why) =>
      const normalizeName = (value) =>
      function documentTotalOf(document)
      async function findExistingReceiptDocument(receipt, { amount, names })
      export async function requestAndIssueReceipt(transactionId, options)
      async function fetchReceiptPdfFromSmartInvoice(receipt)
      function buildReceiptLocalFileName(receipt)
      export async function getReceiptPdf(receipt)
      function cleanForFileName(value)
      function israelDateParts(sqliteUtc)
      export function buildReceiptDriveFileName(receipt)
      export async function saveReceiptToDrive(receipt)
      export function createReceiptShareToken(receiptId)
      export function resolveReceiptShareToken(token)
      const providerViewUrl = (documentId) =>
      async function providerViewLinkFor(receipt)
      export async function buildReceiptShareLinks(receiptId)
      export async function recoverStuckReceipts()
      export async function recoverMissingReceiptCopies()
      export async function sendReceiptOwnerEmail(receipt)
      export async function buildReceiptEmailInfo(receipt)
      function isTemporaryProviderFailure(status, code)
      function watchReceiptForOutage(receiptId, reason = null)
      function stopOutageWatch(event, details = {})
      async function probeSmartInvoice()
      function shortHebrewDate(isoDate)
      function buildOutageRecoveredMessage(rows, probe)
      async function checkOutageRecovery()
      export function resumeReceiptOutageWatch()
      ```
      #### 📄 returnCheckCron.js
      ```
      export function startReturnCheckCron()
      ```
      #### 📄 telegram.js
      ```
      function prepareMessage(message)
      function postMessage({ token, chatId, text })
      export function sendTelegramAlert(message)
      export async function sendTelegramAlertConfirmed(message)
      ```

    ### 📁 utils/
      #### 📄 hebrewDate.js
      ```
      export function getHebrewDate(date, includeYear = false)
      export function getHebrewDateShort(date)
      export function getFullHebrewDate(date)
      ```
      #### 📄 ip.js
      ```
      export function getClientIp(req)
      function cleanIp(ip)
      ```
      #### 📄 israelDate.js
      ```
      export function israelDateIso(date = new Date())
      export function israelTodayIso()
      export function israelOffsetMinutes(date = new Date())
      export function israelEndOfDay(isoDate)
      ```
      #### 📄 textUtils.js
      ```
      function normalizeTextForSave(text)
      function normalizeTextForSearch(text)
      ```

### 📁 dev_tools/
  #### 📄 generate_repo_map.py
  ```
  def should_ignore_dir(dirname: str) -> bool
  def should_ignore_file(filename: str) -> bool
  def get_file_extension(filename: str) -> str
  def extract_python_signatures(filepath: str) -> list
  def extract_js_signatures(filepath: str) -> list
  def extract_shell_signatures(filepath: str) -> list
  def extract_signatures(filepath: str, extension: str) -> list
  def generate_project_map(root_dir: str) -> str
  def main()
  ```

### 📁 docs/
  - 📄 DB-SCHEMA.md
  - 📄 SMARTINVOICE.md

### 📁 frontend/
  #### 📄 next-env.d.ts
  *(no signatures found)*
  #### 📄 next.config.js
  ```
    async rewrites()()
  ```
  - 📄 package.json
  #### 📄 postcss.config.js
  *(no signatures found)*
  #### 📄 tailwind.config.js
  *(no signatures found)*
  - 📄 tsconfig.json

  ### 📁 public/
    - 📄 manifest.json
    #### 📄 sw.js
    ```
    function getCacheRequest(url)
    async function handleShareTarget(request)
    async function handleSharedDataRequest(requestUrl)
    ```

  ### 📁 src/
    #### 📄 middleware.ts
    ```
    function withOriginSecret(request: NextRequest)
    export function middleware(request: NextRequest)
    ```

    ### 📁 app/
      - 📄 globals.css
      #### 📄 layout.tsx
      *(no signatures found)*
      #### 📄 page.tsx
      ```
      export default function HomePage()
      ```

      ### 📁 agreement/
        #### 📄 layout.tsx
        *(no signatures found)*
        #### 📄 page.tsx
        ```
        interface Terms
        interface PrefillData
        function getItemTypeLabel(type: string)
        export default function AgreementPage()
            const fetchTerms = async () =>
            const fetchPrefill = async () =>
          const getCoordinates = (e: React.MouseEvent | React.TouchEvent) =>
          const startDrawing = (e: React.MouseEvent | React.TouchEvent) =>
          const draw = (e: React.MouseEvent | React.TouchEvent) =>
          const stopDrawing = () =>
          const clearSignature = () =>
          const getSignatureData = () =>
          const handleSubmit = async (e: React.FormEvent) =>
        ```

      ### 📁 dashboard/
        #### 📄 layout.tsx
        ```
            const checkAuth = async () =>
        ```
        #### 📄 page.tsx
        ```
        function getCurrentMonthRange():
        interface DashboardData
        export default function DashboardPage()
        ```

        ### 📁 agreements/
          #### 📄 page.tsx
          ```
          interface AgreementRecord
          export default function AgreementsPage()
            const openLink = (url: string | null, label: string) =>
          ```

        ### 📁 customers/
          #### 📄 page.tsx
          ```
          interface Customer
          interface CustomerFormData
          export default function CustomersPage()
            const resetForm = () =>
            const handleEdit = (customer: Customer) =>
            const toggleSelection = (id: number) =>
            const handleMergeClick = () =>
            const executeMerge = async () =>
            const handleSubmit = async (e: React.FormEvent) =>
          function CheckIcon(props: any)
          ```

        ### 📁 dresses/
          #### 📄 page.tsx
          ```
          interface Dress
          interface RentalHistory
          interface DressDetailData
          function getIntendedUseLabel(intendedUse: "rental" | "sale" | null | undefined)
          function getIntendedUseShortLabel(intendedUse: "rental" | "sale" | null | undefined)
          function isDressBookable(status: string)
          interface SavedListState
          function takeSavedListState(): SavedListState | null
          export default function DressesPage()
            const goToEdit = (id: number) =>
            const viewDress = async (id: number) =>
            const toggleSelection = (id: number) =>
            const handleMergeClick = () =>
            const executeMerge = async () =>
          function CheckIcon(props: React.SVGProps<SVGSVGElement>)
          ```

          ### 📁 [id]/

            ### 📁 edit/
              #### 📄 page.tsx
              ```
              export default function EditDressPage()
                      const fetchDress = async () =>
                  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) =>
                  const handleSubmit = async (e: React.FormEvent) =>
              ```

          ### 📁 new/
            #### 📄 page.tsx
            ```
            export default function NewDressPage()
                        const uploadSharedImage = async () =>
                const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) =>
                const handleSubmit = async (e: React.FormEvent) =>
            ```

        ### 📁 export/
          #### 📄 page.tsx
          ```
          function triggerDownload(blob: Blob, fileName: string)
          export default function ExportPage()
            const updateFilter = (key: string, value: string) =>
            const collectFilters = (dataset: ExportDataset) =>
            const exportOneDataset = async (dataset: ExportDataset) =>
            const handleExportSelected = async () =>
            const handleExportAll = async () =>
            const clearSelectedFilters = () =>
            const renderFilterInput = (filter: ExportFilterDefinition) =>
          ```

        ### 📁 orders/
          #### 📄 page.tsx
          ```
          interface Order
          interface OrderDetailData
          interface Attachment
          const getItemTypeLabel = (type: string) =>
          const isOrderVersionSigned = (orderUpdatedAt?: string | null, agreementSignedAt?: string | null) =>
            const normalizeForDateParse = (value: string) =>
          export default function OrdersPage()
            const toggleSelection = (id: number) =>
            const handleMergeClick = () =>
            const executeMerge = async () =>
            const handleStatusUpdate = async (orderId: number, status: string) =>
            const handleDelete = async (order: Order) =>
            const viewOrder = async (orderId: number) =>
            const handleToggleReturn = async (itemId: number, currentReturned: number | null) =>
            const fetchAttachments = async (orderId: number) =>
            const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) =>
            const handleDeleteAttachment = async (attachmentId: number) =>
            const handleSaveDescription = async (attachmentId: number) =>
            const isImageMime = (mime: string | null) =>
            const formatFileSize = (bytes: number) =>
            const handleOpenImmediateSignForViewedOrder = async () =>
          ```

          ### 📁 [id]/

            ### 📁 edit/
              #### 📄 page.tsx
              ```
              interface Dress
              function normalizeDateOnly(value: string | null | undefined)
              function isDressMatchingItemType(dress: Dress | undefined, itemType: string)
              interface OrderItem
              const isOrderVersionSigned = (orderUpdatedAt?: string | null, agreementSignedAt?: string | null) =>
                const normalizeForDateParse = (value: string) =>
              export default function EditOrderPage()
                  const loadData = async () =>
                const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) =>
                const handleDeleteAttachment = async (attachmentId: number) =>
                const handleSaveDescription = async (attachmentId: number) =>
                const isImageMime = (mime: string | null) =>
                const formatFileSize = (bytes: number) =>
                const getDressById = (dressId: string) =>
                const getDressUpcomingOrders = (dressId: string) =>
                const getDressBookedDates = (dressId: string) =>
                const addItem = () =>
                const handleImmediateSign = async () =>
                const removeItem = (index: number) =>
                const updateItem = (index: number, field: keyof OrderItem, value: string) =>
                const handleSubmit = async (e: React.FormEvent) =>
              ```

          ### 📁 new/
            #### 📄 page.tsx
            ```
            interface OrderItem
            interface DepositPayment
            function isPaymentMissingAmount(payment: DepositPayment): boolean
            function getPaymentReceipt(payment: DepositPayment, customer: ReceiptCustomer): ReceiptOptionsState
            interface Dress
            function normalizeDateOnly(value: string | null | undefined)
            function isDressMatchingItemType(dress: Dress | undefined, itemType: string)
            export default function NewOrderPage()
                const loadInitialData = async () =>
              const addItem = () =>
              const removeItem = (index: number) =>
              const getDressById = (dressId: string) =>
              const getDressUpcomingOrders = (dressId: string) =>
              const getDressBookedDates = (dressId: string) =>
              const updateItem = (index: number, field: keyof OrderItem, value: string) =>
              const handleDepositFileChange = async (e: React.ChangeEvent<HTMLInputElement>, paymentIndex: number) =>
              const handlePendingAttachmentAdd = async (e: React.ChangeEvent<HTMLInputElement>) =>
              const removePendingAttachment = (index: number) =>
              const formatPendingFileSize = (bytes: number) =>
              const isImageMimeType = (mime: string | null | undefined) =>
              const openImmediateSignPage = async () =>
              const handleSubmit = async (e: React.FormEvent) =>
            ```

        ### 📁 transactions/
          #### 📄 page.tsx
          ```
          interface Transaction
          function hasFreshPendingReceipt(res: any): boolean
          export default function TransactionsPage()
              const handleKey = (e: KeyboardEvent) =>
            const handleDelete = async (transaction: Transaction) =>
          function ReceiptBadge({ transaction, onFailedClick }: { transaction: Transaction; onFailedClick: () => void })
          function ReceiptActions({ transaction }: { transaction: Transaction })
            const onError = (error: unknown) =>
          ```

          ### 📁 [id]/

            ### 📁 edit/
              #### 📄 page.tsx
              ```
              export default function EditTransactionPage()
                  const loadTransaction = async () =>
                  const loadData = async () =>
                const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) =>
                const handleSubmit = async (e: React.FormEvent) =>
                const handleIssueReceipt = async () =>
                function buildUpdateData()
              ```

          ### 📁 new/
            #### 📄 page.tsx
            ```
            export default function NewTransactionPage()
                const loadData = async () =>
              const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) =>
              const handleSubmit = async (e: React.FormEvent) =>
            ```

      ### 📁 login/
        #### 📄 page.tsx
        ```
        export default function LoginPage()
          const handleSubmit = async (e: React.FormEvent) =>
        ```

      ### 📁 share-target/
        #### 📄 page.tsx
        ```
        function ShareTargetLoading()
        export default function ShareTargetPage()
        ```
        #### 📄 share-target-client.tsx
        ```
        function getOptionIcon(context: SharedUploadContext)
        export function ShareTargetClient()
            const loadSharedFile = async () =>
        ```

    ### 📁 components/
      #### 📄 error-boundary.tsx
      ```
      interface Props
      interface State
      export class ErrorBoundary extends Component<Props, State>
      ```
      #### 📄 global-error-reporter.tsx
      ```
      export function GlobalErrorReporter()
          const handleError = (event: ErrorEvent) =>
          const handleUnhandledRejection = (event: PromiseRejectionEvent) =>
      ```

      ### 📁 dashboard/
        #### 📄 contact-picker.tsx
        ```
        interface ContactInfo
        interface ContactPickerProps
          const handlePickContact = async () =>
        ```
        #### 📄 dress-selector.tsx
        ```
        interface Dress
        interface DressSelectorProps
        function getIntendedUseLabel(value: string | null | undefined)
        type IntendedUseFilter =
        function getDefaultIntendedUseFilter(itemType: string | undefined): IntendedUseFilter
        function matchesIntendedUseFilter(dress: Dress, filter: IntendedUseFilter)
        ```
        #### 📄 receipt-options.tsx
        ```
        export interface ReceiptOptionsState
        export interface ReceiptCustomer
        export function defaultReceiptDescription(category: string): string
        export function defaultReceiptIssue(): boolean
        export function initialReceiptOptions(paymentMethod: string, category: string, customer?: ReceiptCustomer): ReceiptOptionsState
        export function toReceiptRequest(state: ReceiptOptionsState, enabled: boolean): ReceiptRequest | undefined
        export function receiptValidationError(state: ReceiptOptionsState): string | null
        export function useReceiptCustomerName(customerId: string | number | null | undefined, fallbackName: string): ReceiptCustomer
        export function useReceiptsStatus()
        interface ReceiptOptionsProps
        export function ReceiptOptions({ value, onChange, className, hideToggle }: ReceiptOptionsProps)
        ```

      ### 📁 layout/
        #### 📄 global-search.tsx
        ```
        interface SearchResult
        export function GlobalSearch()
                const handleKeyDown = (e: KeyboardEvent) =>
            const handleKeyDown = (e: React.KeyboardEvent) =>
            const getIcon = (type: string) =>
            const getTypeLabel = (type: string) =>
        ```
        #### 📄 mobile-actions.tsx
        ```
        export function MobileActions()
        ```
        #### 📄 sidebar.tsx
        ```
        interface SidebarProps
        export function Sidebar({ onItemClick }: SidebarProps)
          const handleLogout = () =>
          const handleItemClick = () =>
        ```

      ### 📁 pwa/
        #### 📄 sw-register.tsx
        ```
        function urlBase64ToUint8Array(base64String: string)
        export function ServiceWorkerRegister()
        export async function forceResubscribePush()
        ```

      ### 📁 ui/
        #### 📄 button.tsx
        ```
        export interface ButtonProps
        ```
        #### 📄 card.tsx
        *(no signatures found)*
        #### 📄 date-range-filter.tsx
        ```
        interface DateRangeFilterProps
        function getToday():
        function getThisWeek():
        function getThisMonth():
        function getLastMonth():
        function quarterStartMonth(month: number): number
        function getThisQuarter():
        function getLastQuarter():
        function getThisYear():
        function getLastYear():
        export function DateRangeFilter({ onDateChange, dateFrom, dateTo }: DateRangeFilterProps)
        ```
        #### 📄 input.tsx
        ```
        export type InputProps =
        ```
        #### 📄 toast.tsx
        ```
        type ToastProps =
        type ToastActionElement =
        ```
        #### 📄 toaster.tsx
        ```
        export function Toaster()
        ```
        #### 📄 use-toast.ts
        ```
        type ToasterToast =
        function genId()
        type ActionType =
        type Action =
        interface State
        const addToRemoveQueue = (toastId: string) =>
        function dispatch(action: Action)
        type Toast =
        function toast({ ...props }: Toast)
          const update = (props: ToasterToast) =>
          const dismiss = () =>
        function useToast()
        ```

    ### 📁 lib/
      #### 📄 api.ts
      ```
      interface ApiResponse<T = unknown>
      class ApiClient
        constructor()()
        setToken(token: string | null)()
        getToken()()
        isAuthenticated()()
      export interface ReceiptRequest
      export interface Receipt
      export interface ExportFilterOption
      export interface ExportFilterDefinition
      export interface ExportDataset
      function extractFileName(contentDisposition: string | null): string | null
      async function downloadAuthenticatedFile(endpoint: string, fallbackFileName: string): Promise<
      ```
      #### 📄 error-reporter.ts
      ```
      interface ErrorReport
      function hashError(error: ErrorReport): string
      export async function reportClientError(error: ErrorReport)
      ```
      #### 📄 shared-upload.ts
      ```
      export type SharedUploadContext =
      export interface SharedUploadPayload
      function canUseStorage()
      export function saveSharedUploadPayload(payload: SharedUploadPayload)
      export function getSharedUploadPayload(): SharedUploadPayload | null
      export function clearSharedUploadPayload()
      export function base64ToFile(base64: string, fileName: string, mimeType: string): File
      export function blobToBase64(blob: Blob): Promise<string>
      function imageFormatLikelyHasAlpha(file: File): boolean
      function canvasLooksUniformlyFlat(ctx: CanvasRenderingContext2D, w: number, h: number): boolean
      export function compressImageForUpload(file: File): Promise<string>
      export function readImageFileAsBase64(file: File): Promise<string>
      export interface AttachmentCompressionOptions
      function stripFileExtension(name: string): string
      function isCompressibleImage(file: File): boolean
          const finishWithOriginal = () =>
      ```
      #### 📄 utils.ts
      ```
      export function cn(...inputs: ClassValue[])
      export function resolveFileUrl(pathOrUrl: string | null | undefined): string | null
      export function formatCurrency(amount: number | null | undefined): string
      export function formatDate(date: string | Date | null | undefined): string
      export function formatDateShort(date: string | Date | null | undefined): string
      export function formatDateInput(date: string | Date | null | undefined): string
      export function formatTime(date: string | Date | null | undefined): string
      export function formatDateTime(date: string | Date | null | undefined): string
      export function getHebrewDayName(date: string | Date): string
      export function getRelativeDate(date: string | Date): string
      export function getStatusLabel(status: string): string
      export function getStatusColor(status: string): string
      export function getCategoryLabel(category: string): string
      export function getPaymentMethodLabel(method: string): string
      export function formatPhoneNumber(phone: string | null | undefined): string
      export function normalizePhoneInput(phone: string | null | undefined): string
      export function createWhatsAppLink(phone: string, message?: string): string
      ```

### 📁 scripts/
  #### 📄 auto-update-direct.sh
  ```
  log() {
  rotate_auto_update_log() {
  ```
  #### 📄 backup-to-telegram.sh
  ```
  log() {
  ```
  #### 📄 configure.sh
  ```
  header() {
  log()   {
  warn()  {
  ask()   {
  replace_in_files() {
  ```
  #### 📄 daily-security-report.sh
  ```
  log() {
  ```
  #### 📄 pm2-ecosystem.config.js
  *(no signatures found)*
  #### 📄 setup-new-server.sh
  ```
  log()    {
  warn()   {
  error()  {
  header() {
  ask()    {
  ensure_secret() {
  ```
  #### 📄 start-app.sh
  *(no signatures found)*
  #### 📄 start-backend.sh
  *(no signatures found)*
  #### 📄 sync-from-cloud.sh
  ```
  log() {
  ```
  #### 📄 sync-to-cloud.sh
  ```
  log() {
  ```
  #### 📄 telegram-notify.sh
  ```
  send_telegram() {
  ```
  #### 📄 view-logs.sh
  *(no signatures found)*
  #### 📄 wait-for-port.sh
  *(no signatures found)*

  ### 📁 nginx/
    - 📄 origin-secret.conf.template
