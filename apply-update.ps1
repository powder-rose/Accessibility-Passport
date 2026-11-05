param([Parameter(Mandatory = $true)][string]$ProjectPath)
$ErrorActionPreference = 'Stop'
$targetRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
$sourceRoot = $PSScriptRoot
$packagePath = Join-Path $targetRoot 'package.json'
if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw 'package.json was not found. Choose the project root.' }
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne 'boykov-accessibility-passport') { throw 'This update belongs to boykov-accessibility-passport. No files were changed.' }
$files = @(
    '.gitignore',
    '.dockerignore',
    '.env.example',
    'Dockerfile',
    'compose.yaml',
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'README.md',
    'GITHUB.md',
    'UPDATE.md',
    'apply-update.ps1',
    'src/App.tsx',
    'src/components/admin/AdminConsole.tsx',
    'src/components/admin/AdminLayout.tsx',
    'src/components/admin/AdminLogin.tsx',
    'src/components/admin/AttachmentSettings.tsx',
    'src/components/admin/LeadDashboard.tsx',
    'src/components/admin/LeadList.tsx',
    'src/components/admin/articles/ArticleCover.tsx',
    'src/components/admin/articles/ArticleEdit.tsx',
    'src/components/admin/articles/ArticleFields.tsx',
    'src/components/admin/articles/ArticlePreview.tsx',
    'src/components/admin/articles/ArticlesList.tsx',
    'src/components/admin/articles/ArticlesWorkspace.tsx',
    'src/components/admin/articles/api.ts',
    'src/components/admin/articles/preview-storage.ts',
    'src/components/admin/articles/useArticleForm.ts',
    'src/components/admin/editor/EditorLinkDialog.tsx',
    'src/components/admin/editor/EditorLinks.tsx',
    'src/components/admin/editor/EditorToolbar.tsx',
    'src/components/admin/editor/ImageCropper.tsx',
    'src/components/admin/editor/RichTextEditor.tsx',
    'src/components/admin/types.ts',
    'src/components/articles/ArticleView.tsx',
    'src/components/forms/ContactFields.tsx',
    'src/components/forms/ContactSection.tsx',
    'src/components/forms/DocumentAttachments.tsx',
    'src/components/forms/ExpressCheck.tsx',
    'src/components/forms/useLeadSubmission.ts',
    'src/components/questionnaire/DataFlowGraphic.tsx',
    'src/components/questionnaire/QuestionnaireAdvantages.tsx',
    'src/components/questionnaire/QuestionnaireContents.tsx',
    'src/components/questionnaire/QuestionnaireHero.tsx',
    'src/components/questionnaire/QuestionnaireNext.tsx',
    'src/components/questionnaire/QuestionnaireOverview.tsx',
    'src/components/questionnaire/QuestionnairePrice.tsx',
    'src/components/questionnaire/QuestionnaireProcess.tsx',
    'src/components/questionnaire/QuestionnaireRegulations.tsx',
    'src/components/questionnaire/QuestionnaireSourceData.tsx',
    'src/components/questionnaire/QuestionnaireStructure.tsx',
    'src/components/sections/DocumentOverview.tsx',
    'src/components/sections/Documents.tsx',
    'src/components/sections/Experience.tsx',
    'src/components/sections/Expert.tsx',
    'src/components/sections/Faq.tsx',
    'src/components/sections/Hero.tsx',
    'src/components/sections/Objects.tsx',
    'src/components/sections/OtherServices.tsx',
    'src/components/sections/Pricing.tsx',
    'src/components/sections/Process.tsx',
    'src/components/sections/Regulations.tsx',
    'src/components/sections/Responsibility.tsx',
    'src/components/sections/SourceData.tsx',
    'src/components/sections/Trust.tsx',
    'src/components/service/AccessDiagram.tsx',
    'src/components/service/NumberedGrid.tsx',
    'src/components/service/ServiceAdvantages.tsx',
    'src/components/service/ServiceComparison.tsx',
    'src/components/service/ServiceContents.tsx',
    'src/components/service/ServiceGlyph.tsx',
    'src/components/service/ServiceHero.tsx',
    'src/components/service/ServiceHeroTitle.tsx',
    'src/components/service/ServiceNext.tsx',
    'src/components/service/ServiceObjects.tsx',
    'src/components/service/ServiceOverview.tsx',
    'src/components/service/ServicePackage.tsx',
    'src/components/service/ServicePrice.tsx',
    'src/components/service/ServiceProcess.tsx',
    'src/components/service/ServiceRegulations.tsx',
    'src/components/service/ServiceSourceData.tsx',
    'src/components/service/ServiceStructure.tsx',
    'src/components/service/presentation-types.ts',
    'src/components/service/presentations.ts',
    'src/components/site/Breadcrumbs.tsx',
    'src/components/site/ExpertPortrait.tsx',
    'src/components/site/Footer.tsx',
    'src/components/site/Header.tsx',
    'src/components/site/Interactions.tsx',
    'src/components/site/ObjectCards.tsx',
    'src/components/site/QuizLink.tsx',
    'src/components/site/primitives.tsx',
    'src/components/update/UpdateAction.tsx',
    'src/components/update/UpdateCards.tsx',
    'src/components/update/UpdateDocuments.tsx',
    'src/components/update/UpdateHero.tsx',
    'src/components/update/UpdateOverview.tsx',
    'src/components/update/UpdatePrice.tsx',
    'src/components/update/UpdateProcess.tsx',
    'src/components/update/UpdateRelated.tsx',
    'src/components/update/UpdateSourceData.tsx',
    'src/components/update/UpdateSupport.tsx',
    'src/content/home.json',
    'src/content/legal.json',
    'src/content/questionnaire.json',
    'src/content/survey.json',
    'src/content/update.json',
    'src/entry-client.tsx',
    'src/entry-server.tsx',
    'src/features/articles/links.ts',
    'src/features/articles/model.ts',
    'src/lib/analytics.ts',
    'src/lib/attachments.ts',
    'src/lib/classify.ts',
    'src/lib/content-schema.ts',
    'src/lib/content-types.ts',
    'src/lib/crypto.ts',
    'src/lib/request-id.ts',
    'src/lib/resolve-content.ts',
    'src/lib/routes.ts',
    'src/lib/service-intent.ts',
    'src/lib/service-page-types.ts',
    'src/page-data.ts',
    'src/pages/ArticlePage.tsx',
    'src/pages/BlogPage.tsx',
    'src/pages/DocumentServicePage.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/LegalPage.tsx',
    'src/pages/NotFoundPage.tsx',
    'src/pages/UpdatePage.tsx',
    'src/styles/admin-articles.css',
    'src/styles/admin-editor.css',
    'src/styles/admin-shell.css',
    'src/styles/articles.css',
    'src/styles/attachments.css',
    'src/styles/globals.css',
    'src/styles/questionnaire/data.css',
    'src/styles/questionnaire/hero.css',
    'src/styles/questionnaire/overview.css',
    'src/styles/questionnaire/work.css',
    'src/styles/questionnaire.css',
    'src/styles/service-page.css',
    'src/styles/update/hero.css',
    'src/styles/update/sections.css',
    'src/styles/update.css',
    'src/vite-env.d.ts',
    'server/api/admin-leads.ts',
    'server/api/admin-login.ts',
    'server/api/attachments.ts',
    'server/api/body.ts',
    'server/api/context.ts',
    'server/api/leads.ts',
    'server/api/router.ts',
    'server/api/security.ts',
    'server/application.ts',
    'server/articles/api.ts',
    'server/articles/html.ts',
    'server/articles/images.ts',
    'server/articles/migration.ts',
    'server/articles/repository.ts',
    'server/articles/seo.ts',
    'server/config.ts',
    'server/content.ts',
    'server/db/migrations.ts',
    'server/db/store.ts',
    'server/html.ts',
    'server/index.ts',
    'server/page-data.ts',
    'server/seo.ts',
    'server/service-content.ts',
    'server/uploads/errors.ts',
    'server/uploads/office.ts',
    'server/uploads/parse-lead.ts',
    'server/uploads/validate.ts',
    'public/favicon.svg',
    'public/fonts/LICENSE-Inter.txt',
    'public/fonts/inter-variable.woff2',
    'public/images/administrative.svg',
    'public/images/boykov-hero-clean.webp',
    'public/images/boykov-hero.webp',
    'public/images/culture.svg',
    'public/images/education.svg',
    'public/images/health.svg',
    'public/images/hotel.svg',
    'public/images/nikolay-boykov-expert.webp',
    'public/images/og-accessibility.svg',
    'public/images/og-accessibility.webp',
    'public/images/social.svg',
    'public/images/sport.svg',
    'public/images/trade.svg',
    'scripts/setup-admin.mjs',
    'tests/articles.test.ts',
    'tests/business.test.mjs',
    'tests/dev.test.ts',
    'tests/fixtures/documents.ts',
    'tests/integration.test.ts',
    'tests/service-pages.test.ts',
    'tests/setup.test.ts',
    'tests/uploads.test.ts',
    'docs/ARTICLES-ADMIN.md',
    'docs/PALETTE.md',
    'docs/QUESTIONNAIRE-PAGE.md',
    'docs/SURVEY-PAGE.md',
    'docs/UPDATE-PAGE.md',
    'docs/VERIFICATION.md',
    'docs/accents-preview.jpg',
    'docs/document-overview-preview.jpg',
    'docs/expert-preview.jpg',
    'docs/home-preview.jpg',
    'docs/react-vite-preview.jpg'
)
$obsolete = @('src/components/admin/ContentFields.tsx', 'server/api/admin-content.ts', 'src/pages/SurveyPage.tsx', 'tests/survey.test.ts', 'src/components/service/QuestionnaireStructure.tsx')
foreach ($relative in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $relative) -PathType Leaf)) {
        throw "Missing update file: $relative. No files were changed."
    }
}
$dataPath = Join-Path $targetRoot 'data'
if (Test-Path -LiteralPath $dataPath -PathType Container) {
    foreach ($dataFile in (Get-ChildItem -LiteralPath $dataPath -Recurse -File)) {
        $handle = $null
        try { $handle = [IO.File]::Open($dataFile.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None) }
        catch {
            $dataFailure = $_.Exception.GetBaseException()
            $dataFailureCode = $dataFailure.HResult -band 0xffff
            if ($dataFailureCode -in @(32, 33)) {
                throw ('Data file is in use: {0}. Stop the application and disconnect SQLite viewers, then retry. Details: {1}. No source files were changed.' -f $dataFile.FullName, $dataFailure.Message)
            }
            throw ('Cannot read data file for backup: {0}. Check read permissions and the original error. Details: {1}. No source files were changed.' -f $dataFile.FullName, $dataFailure.Message)
        }
        finally { if ($null -ne $handle) { $handle.Dispose() } }
    }
}
$backupRoot = Join-Path $targetRoot ('.update-backups/palette-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
if (Test-Path -LiteralPath $dataPath -PathType Container) {
    Copy-Item -LiteralPath $dataPath -Destination (Join-Path $backupRoot 'data') -Recurse -Force
}
foreach ($relative in ($files + $obsolete)) {
    $existing = Join-Path $targetRoot $relative
    if (Test-Path -LiteralPath $existing -PathType Leaf) {
        $backup = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
        Copy-Item -LiteralPath $existing -Destination $backup -Force
    }
}
foreach ($relative in $files) {
    $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
    $destination = [IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
    if ($source -ne $destination) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}
foreach ($relative in $obsolete) {
    $existing = Join-Path $targetRoot $relative
    if (Test-Path -LiteralPath $existing -PathType Leaf) { Remove-Item -LiteralPath $existing -Force }
}
foreach ($relative in $files) {
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot $relative) -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath (Join-Path $targetRoot $relative) -Algorithm SHA256).Hash
    if ($sourceHash -ne $targetHash) { throw "Update verification failed: $relative. Source backup: $backupRoot" }
}
Write-Host 'Update completed. Environment settings and application data were preserved.'
Write-Host ('Verified files: ' + $files.Count)
Write-Host 'Palette updated: graphite, neutral gray and orange. All previous pages and the article editor are included.'
Write-Host ('Source and standard data backup: ' + $backupRoot)
Write-Host 'The next startup migrates SQLite to schema 3 and preserves existing leads, attachments and settings.'
Write-Host 'For custom DATABASE_PATH outside data, back up that database separately before startup.'
Write-Host 'Run npm ci to install the full project dependencies, including the existing article editor.'
Write-Host 'Then restart development with npm run dev. For production, run npm run check and restart the application.'
