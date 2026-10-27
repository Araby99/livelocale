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
  ReviewPanel,
  FirstRunTips,
  StudioLayout,
  useStudio,
  useMediaQuery,
  WIDE_LAYOUT_QUERY,
  type StudioPanel,
} from './features/dashboard/index.js';
import { isAppPreviewBlocked } from './runtime.js';

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
    reviewError,
    isReviewLoading,
    reviewFocusKey,
    closeReview,
    selectReviewLocale,
  } = useStudio();

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
  const isReviewing = review !== null || reviewError !== null;
  useEffect(() => {
    if (isReviewing) setOpenPanel('side');
  }, [isReviewing]);

  const pickKey = useCallback(
    (key: string) => {
      selectKeyDirectly(key);
      setOpenPanel('side');
    },
    [selectKeyDirectly]
  );

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0f19] text-slate-100 font-sans select-none overflow-hidden antialiased">
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
        onCloseReview={closeReview}
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
      />

      <SetupProblems problems={setupProblems} />

      {/* Main Studio Viewport: three columns from 1280px, drawers below. */}
      <StudioLayout
        isWide={isWide}
        openPanel={openPanel}
        onOpenPanelChange={setOpenPanel}
        sideLabel={isReviewing ? 'Review' : 'Editor'}
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
          />
        }
        viewer={
          /* A share-folder Studio without a usable manifest has no app to point at,
             so it shows only the setup problem above. */
          isAppPreviewBlocked() ? (
            <section
              data-testid="app-preview-blocked"
              className="flex-1 flex items-center justify-center h-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-400"
            >
              The app preview is unavailable until the setup problem above is fixed.
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
              onSelectLocale={selectReviewLocale}
              onClose={closeReview}
              studioHref={window.location.href}
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
