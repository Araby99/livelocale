import React, { useCallback, useEffect, useState } from 'react';
import {
  Header,
  KeysDirectory,
  IframeViewer,
  EditorPanel,
  ConfirmModal,
  ChangesPanel,
  TokenModal,
  SetupProblems,
  LocalePicker,
  SendDialog,
  ImportChangeDialog,
  ReviewPanel,
  FirstRunTips,
  StudioLayout,
  ThemeToggle,
  LanguageToggle,
  useStudio,
  useTheme,
  useMediaQuery,
  WIDE_LAYOUT_QUERY,
  type StudioPanel,
} from './features/dashboard/index.js';
import { TRANSLATION_INPUT_ID } from './features/dashboard/constants.js';
import { isAppPreviewBlocked, isShareStudio } from './runtime.js';
import { useStudioText } from './i18n/StudioLanguage.js';

export const App = () => {
  const {
    selected,
    selectionCount,
    inputValue,
    locale,
    connectionStatus,
    isLoading,
    isSuccess,
    error,
    currentPath,
    iframeRef,
    appOrigin,
    appUrl,
    showConfirmModal,
    searchTerm,
    filteredKeys,
    localeData,
    coveragePercentage,
    setSearchTerm,
    selectKeyDirectly,
    handleInputChange,
    handleLocaleChange,
    handleSave,
    saveWarning,
    handleForceSave,
    dismissSaveWarning,
    handleClearSelection,
    confirmDiscard,
    cancelDiscard,
    locales,
    handleAddLocale,
    handleRenameLocale,
    handleDeleteLocale,
    filterPageOnly,
    setFilterPageOnly,
    visibleKeys,
    isChangesOpen,
    toggleChanges,
    closeChanges,
    git,
    gitError,
    isGitLoading,
    lastCommit,
    commitChanges,
    discardChanges,
    refreshGit,
    history,
    undoEntry,
    isUndoing,
    mode,
    needsToken,
    submitToken,
    setupProblems,
    drafts,
    liveNow,
    dismissLiveNow,
    undoDraft,
    downloadBackup,
    restoreBackupFile,
    unsentCount,
    sentCount,
    markDraftsSent,
    staticManifest,
    isSendOpen,
    openSend,
    closeSend,
    targetLocale,
    localePickerCandidates,
    chooseTargetLocale,
    cancelLocalePick,
    showTips,
    dismissTips,
    translatorName,
    setTranslatorName,
    review,
    isReviewing,
    reviewError,
    isReviewLoading,
    reviewFocusKey,
    reviewFocusSeq,
    closeReview,
    selectReviewLocale,
    reviewRepo,
    reviewRepoFromManifest,
    setReviewRepo,
    applyLocal,
    applyResults,
    isApplying,
    isImportOpen,
    openImport,
    closeImport,
    submitImport,
    importError,
  } = useStudio();
  const theme = useTheme(isShareStudio());
  const { lang, dir, t } = useStudioText();

  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY, true);
  const [openPanel, setOpenPanel] = useState<StudioPanel>(null);

  // Every completed pick brings the editor forward when it lives in a drawer,
  // including a repeat pick of the key that is already selected. Keyed on the
  // pick count, not the key, so closing the drawer and picking the same key
  // again reopens it.
  useEffect(() => {
    if (selectionCount > 0) setOpenPanel('side');
  }, [selectionCount]);

  // A change link replaces the editor with the Review panel and brings it forward in a drawer.
  useEffect(() => {
    if (isReviewing) setOpenPanel('side');
  }, [isReviewing]);

  // Alt+Click during a review points at a row; bring the Review drawer forward each time,
  // a repeat click on the same key included.
  useEffect(() => {
    if (reviewFocusSeq > 0) setOpenPanel('side');
  }, [reviewFocusSeq]);

  const pickKey = useCallback(
    (key: string) => {
      selectKeyDirectly(key);
      setOpenPanel('side');
    },
    [selectKeyDirectly]
  );

  // A pick made from the keyboard lands in the editor, so typing goes straight into the
  // translation. The frame lets the new selection and the opened drawer render first.
  const focusEditor = useCallback(() => {
    setOpenPanel('side');
    requestAnimationFrame(() => {
      // An unsaved-changes prompt may have opened instead; it keeps the focus.
      if (document.querySelector('[aria-modal="true"]') !== null) return;
      const target =
        document.getElementById(TRANSLATION_INPUT_ID) ??
        document.querySelector('[data-testid="editor-panel"]')?.querySelector('input');
      target?.focus();
    });
  }, []);

  return (
    <div
      data-testid="studio-root"
      lang={lang}
      dir={dir}
      className="w-screen h-screen flex flex-col bg-app text-fg font-sans select-none overflow-hidden antialiased"
    >
      <TokenModal isOpen={needsToken} onSubmit={submitToken} />

      <Header
        coveragePercentage={coveragePercentage}
        mode={mode}
        changesCount={mode === 'static' ? drafts.length : (git?.changes.length ?? 0)}
        isChangesOpen={isChangesOpen}
        onToggleChanges={toggleChanges}
        unsentCount={unsentCount}
        targetLocale={targetLocale}
        locales={locales}
        onChooseLocale={chooseTargetLocale}
        canSend={unsentCount + sentCount > 0}
        onSend={mode === 'static' ? openSend : undefined}
        reviewCount={review ? review.rows.length : null}
        isReviewing={isReviewing}
        onCloseReview={closeReview}
        onImport={openImport}
        settings={
          <>
            <LanguageToggle />
            <ThemeToggle choice={theme.choice} onChange={theme.setChoice} />
          </>
        }
      />

      <ChangesPanel
        isOpen={isChangesOpen}
        onClose={closeChanges}
        git={git}
        gitError={gitError}
        isGitLoading={isGitLoading}
        lastCommit={lastCommit}
        onCommit={commitChanges}
        onDiscard={discardChanges}
        onRefresh={refreshGit}
        history={history}
        onUndo={undoEntry}
        isUndoing={isUndoing}
        drafts={mode === 'static' ? drafts : undefined}
        onUndoDraft={undoDraft}
        onDownloadBackup={downloadBackup}
        onRestoreBackup={restoreBackupFile}
        liveNow={mode === 'static' ? liveNow : undefined}
        onDismissLiveNow={mode === 'static' ? dismissLiveNow : undefined}
        onReviewChange={mode === 'static' ? openImport : undefined}
      />

      <SetupProblems problems={setupProblems} />

      {/* Main Studio Viewport: three columns from 1280px, drawers below. */}
      <StudioLayout
        isWide={isWide}
        openPanel={openPanel}
        onOpenPanelChange={setOpenPanel}
        sideLabel={isReviewing ? t('layout.review') : t('layout.editor')}
        keys={
          <KeysDirectory
            className={isWide ? undefined : 'w-full'}
            filteredKeys={filteredKeys}
            selected={selected}
            localeData={localeData}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterPageOnly={filterPageOnly}
            setFilterPageOnly={setFilterPageOnly}
            visibleKeys={visibleKeys}
            selectKeyDirectly={pickKey}
            onKeyActivatedByKeyboard={focusEditor}
          />
        }
        viewer={
          /* A share-folder Studio without a usable manifest has no app to point at,
             so it shows only the setup problem above. */
          isAppPreviewBlocked() ? (
            <section
              data-testid="app-preview-blocked"
              className="flex-1 flex items-center justify-center h-full bg-raised border border-line rounded-2xl p-6 text-center text-sm text-fg-muted"
            >
              {t('viewer.preview_blocked')}
            </section>
          ) : (
            <IframeViewer
              iframeRef={iframeRef}
              appOrigin={appOrigin}
              appUrl={appUrl}
              connectionStatus={connectionStatus}
              currentPath={currentPath}
            />
          )
        }
        side={
          isReviewing ? (
            <ReviewPanel
              className={isWide ? undefined : 'w-full'}
              review={review}
              error={reviewError}
              isLoading={isReviewLoading}
              focusKey={reviewFocusKey}
              focusSeq={reviewFocusSeq}
              locale={locale}
              onSelectLocale={selectReviewLocale}
              onClose={closeReview}
              studioHref={window.location.href}
              repo={reviewRepo}
              repoFromManifest={reviewRepoFromManifest}
              onRepoChange={setReviewRepo}
              onApplyLocal={review?.target === 'local' ? applyLocal : undefined}
              applyResults={applyResults}
              isApplying={isApplying}
            />
          ) : (
            <EditorPanel
              className={isWide ? undefined : 'w-full'}
              selected={selected}
              inputValue={inputValue}
              locale={locale}
              isLoading={isLoading}
              isSuccess={isSuccess}
              error={error}
              onInputChange={handleInputChange}
              onLocaleChange={handleLocaleChange}
              onSave={() => handleSave()}
              saveWarning={saveWarning}
              onForceSave={handleForceSave}
              onDismissWarning={dismissSaveWarning}
              onClear={handleClearSelection}
              locales={locales}
              onAddLocale={handleAddLocale}
              onRenameLocale={handleRenameLocale}
              onDeleteLocale={handleDeleteLocale}
            />
          )
        }
      />

      {/* Custom Confirmation Modal (replacing window.confirm) */}
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />

      <SendDialog
        isOpen={mode === 'static' && isSendOpen}
        onClose={closeSend}
        drafts={drafts}
        manifest={staticManifest}
        studioHref={window.location.href}
        onMarkSent={markDraftsSent}
      />

      <ImportChangeDialog
        isOpen={isImportOpen}
        onClose={closeImport}
        onSubmit={submitImport}
        error={importError}
      />

      <FirstRunTips
        open={showTips}
        name={translatorName}
        onNameChange={setTranslatorName}
        onDismiss={dismissTips}
      />

      <LocalePicker
        candidates={localePickerCandidates}
        onChoose={chooseTargetLocale}
        onCancel={cancelLocalePick}
      />
    </div>
  );
};
export default App;
