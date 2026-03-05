# 🗺️ PROJECT MAP: dress-rental-business-management

**Generated:** 2026-03-05 09:46:57

> **Note:** This map shows the project structure and code signatures (classes, functions, methods).
> Run `python3 dev_tools/generate_repo_map.py` to regenerate after significant changes.

---

## 📁 / (root)
- 📄 .dockerignore
- 📄 .gitignore
- 📄 ARCHITECTURE.md
- 📄 CHANGELOG.md
- 📄 CONTRIBUTING.md
- 📄 Dockerfile
- 📄 LICENSE
- 📄 PROJECT_MAP.md
- 📄 README.md
- 📄 SECURITY.md
- 📄 SETUP.md
- 📄 docker-compose.yml
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
  function handleIncomeDetailed(payload)
  function handleOrderNotification(payload)
  function getMimeTypeFromFilename(filename)
  function handleNotificationGeneric(payload, type)
  function uploadFileToDrive(base64Data, fileName, folderPath)
  function getHebrewDate(date)
  function sendErrorNotification(error)
  function testDoPost()
  ```
  - 📄 appsscript.json

### 📁 backend/
  - 📄 package.json

  ### 📁 src/
    #### 📄 index.js
    ```
    function shutdown()
    ```

    ### 📁 config/
      #### 📄 index.js
      *(no signatures found)*

    ### 📁 constants/
      #### 📄 agreementTerms.js
      *(no signatures found)*

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
      export function requireAuth(req, res, next)
      export function optionalAuth(req, res, next)
      export function requireAdmin(req, res, next)
      export function generateToken(userId)
      ```
      #### 📄 errorHandler.js
      ```
      export class ApiError extends Error
        constructor(statusCode, message, details = null)()
      export function notFoundHandler(req, res, next)
      export function errorHandler(err, req, res, next)
      ```

    ### 📁 routes/
      #### 📄 agreements.js
      ```
      function getOrderForAgreement(orderId)
      function createAgreementToken(orderId)
      function resolveAgreementToken(token)
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
      ```
      #### 📄 auth.js
      *(no signatures found)*
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
      function ensureOrderDir(orderId)
      function assertOrderExists(orderId)
      ```
      #### 📄 orders.js
      ```
      function getMimeTypeFromFileName(fileName = '')
      function getItemTypeLabel(type)
      function syncDressSaleStatus(dressId)
      ```
      #### 📄 transactions.js
      ```
      function getCategoryDisplayName(category)
      function normalizeBankDetails(value)
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
      function formatDateHebrew(date)
      function createWhatsAppLink(phone, message = '')
      export async function testEmailConnection()
      export async function sendToAppsScript(payload)
      export async function sendCalendarEvent({ title, date, allDay = true })
      export async function sendTaskToGoogle({ listName = 'לקוחות', title, dueDate })
      export async function sendFileToDrive({ fileName, folder, fileBuffer })
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
      function formatDateForFolder(date = new Date())
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
      function writeToFiles(level, category, action, data)
      export function logUserAction(req, action, category, entityType = null, entityId = null, entityName = null, details = null)
      export function logError(req, error, category = LogCategory.ERROR)
      export function logLogin(email, success, userId = null, userName = null, ipAddress = null, userAgent = null, errorMessage = null)
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

    ### 📁 utils/
      #### 📄 hebrewDate.js
      ```
      export function getHebrewDate(date, includeYear = false)
      export function getHebrewDateShort(date)
      export function getFullHebrewDate(date)
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
  - 📄 tsconfig.tsbuildinfo

  ### 📁 public/
    - 📄 manifest.json
    #### 📄 sw.js
    ```
    function getCacheRequest(url)
    async function handleShareTarget(request)
    async function handleSharedDataRequest(requestUrl)
    ```

  ### 📁 src/

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
        interface DashboardData
        export default function DashboardPage()
            const fetchData = async () =>
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
            const handleDelete = async (customer: Customer) =>
          function CheckIcon(props: any)
          ```

        ### 📁 dresses/
          #### 📄 page.tsx
          ```
          interface Dress
          interface RentalHistory
          interface DressDetailData
          function getIntendedUseLabel(intendedUse: "rental" | "sale" | null | undefined)
          function isDressBookable(status: string)
          export default function DressesPage()
            const viewDress = async (id: number) =>
            const handleDelete = async (e: React.MouseEvent, dress: Dress) =>
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
          export default function OrdersPage()
            const toggleSelection = (id: number) =>
            const handleMergeClick = () =>
            const executeMerge = async () =>
            const handleStatusUpdate = async (orderId: number, status: string) =>
            const handleDelete = async (order: Order) =>
            const viewOrder = async (orderId: number) =>
            const fetchAttachments = async (orderId: number) =>
            const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) =>
            const handleDeleteAttachment = async (attachmentId: number) =>
            const handleSaveDescription = async (attachmentId: number) =>
            const isImageMime = (mime: string | null) =>
            const formatFileSize = (bytes: number) =>
            const handleCreateSignLinkForViewedOrder = async (openWhatsapp: boolean) =>
          ```

          ### 📁 [id]/

            ### 📁 edit/
              #### 📄 page.tsx
              ```
              interface OrderItem
              export default function EditOrderPage()
                  const loadData = async () =>
                const addItem = () =>
                const handleSendSignatureLink = async (openWhatsapp: boolean) =>
                const removeItem = (index: number) =>
                const updateItem = (index: number, field: keyof OrderItem, value: string) =>
                const handleSubmit = async (e: React.FormEvent) =>
              ```

          ### 📁 new/
            #### 📄 page.tsx
            ```
            interface OrderItem
            interface DepositPayment
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
              const handleDepositFileChange = (e: React.ChangeEvent<HTMLInputElement>, paymentIndex: number) =>
              const generateSignLinkForCreatedOrder = async (orderId: number, openWhatsapp: boolean) =>
              const handleSubmit = async (e: React.FormEvent) =>
            ```

        ### 📁 transactions/
          #### 📄 page.tsx
          ```
          interface Transaction
          export default function TransactionsPage()
            const handleDelete = async (transaction: Transaction) =>
          ```

          ### 📁 [id]/

            ### 📁 edit/
              #### 📄 page.tsx
              ```
              export default function EditTransactionPage()
                  const loadTransaction = async () =>
                  const loadData = async () =>
                const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) =>
                const handleSubmit = async (e: React.FormEvent) =>
              ```

          ### 📁 new/
            #### 📄 page.tsx
            ```
            export default function NewTransactionPage()
                const loadData = async () =>
              const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) =>
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
        export function ServiceWorkerRegister()
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
      export interface ExportFilterOption
      export interface ExportFilterDefinition
      export interface ExportDataset
      function extractFileName(contentDisposition: string | null): string | null
      async function downloadCsvFile(endpoint: string): Promise<
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

### 📁 local_data/

  ### 📁 backend_data/
    - 📄 business.db

### 📁 scripts/
  #### 📄 auto-update-direct.sh
  ```
  log() {
  rotate_auto_update_log() {
  ```
  #### 📄 auto-update.sh
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
  #### 📄 entrypoint.sh
  ```
  shutdown() {
  ```
  #### 📄 pm2-ecosystem.config.js
  *(no signatures found)*
  #### 📄 setup-direct-install.sh
  ```
  log()  {
  warn() {
  error(){
  ```
  #### 📄 setup-new-server.sh
  ```
  log()    {
  warn()   {
  error()  {
  header() {
  ask()    {
  ```
  #### 📄 setup-vps.sh
  ```
  log()    {
  warn()   {
  error()  {
  header() {
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
  #### 📄 view-logs.sh
  *(no signatures found)*
  #### 📄 wait-for-port.sh
  *(no signatures found)*

### 📁 temp_cache/
  - 📄 uncommitted.diff
