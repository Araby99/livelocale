import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  EditBrowseSwitch,
  TapNotice,
  StudioLayout,
  ThemeToggle,
  PhoneTopBar,
  PhoneShell,
  PhoneEditorSheet,
  NextMissingButton,
  BottomSheet,
  AddressBar,
  useStudio,
  useTheme,
  useMediaQuery,
  WIDE_LAYOUT_QUERY,
  type StudioPanel,
} from './features/dashboard/index.js';
import { TRANSLATION_INPUT_ID } from './features/dashboard/constants.js';
import { isAppPreviewBlocked, isShareStudio } from './runtime.js';
import { useStudioText } from './i18n/StudioLanguage.js';

// A row of the phone's More menu, at least 44px tall for a thumb.
const PHONE_MENU_ITEM =
  'min-h-11 w-full px-4 inline-flex items-center justify-between gap-2 rounded-xl border bg-raised border-line text-fg text-xs font-semibold hover:border-line-strong transition duration-150';
const PHONE_KEYS_TITLE_ID = 'studio-phone-keys-title';

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
    navigation,
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
    isTouch,
    isPhone,
    supportsEditMode,
    editMode,
    setEditMode,
    unkeyedTapSeq,
    renderedKeys,
    selectKeyInPage,
    revealKeyInPage,
  } = useStudio();
  const theme = useTheme(isShareStudio());
  const { t } = useStudioText();

  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY, true);
  // Tap to edit needs a touch device and a client that knows Edit mode; an older client keeps
  // the view-only behaviour, with no switch that would do nothing.
  const canTapEdit = isTouch && supportsEditMode;
  const [openPanel, setOpenPanel] = useState<StudioPanel>(null);
  // The phone's keys list, a sheet opened from the More menu.
  const [isKeysSheetOpen, setIsKeysSheetOpen] = useState(false);

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

  const viewer = (compact: boolean) =>
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
        navigation={navigation}
        toolbar={!compact}
      />
    );

  const side = (footer?: ReactNode) =>
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
        footer={footer}
      />
    );

  const keysDirectory = (onPick: (key: string) => void) => (
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
      selectKeyDirectly={onPick}
      onKeyActivatedByKeyboard={isPhone ? undefined : focusEditor}
    />
  );

  const changesCount = mode === 'static' ? drafts.length : (git?.changes.length ?? 0);
  const themeToggle = <ThemeToggle choice={theme.choice} onChange={theme.setChoice} />;

  const changesPanel = (
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
  );

  const sendDialog = (
    <SendDialog
      isOpen={mode === 'static' && isSendOpen}
      onClose={closeSend}
      drafts={drafts}
      manifest={staticManifest}
      studioHref={window.location.href}
      onMarkSent={markDraftsSent}
      presentation={isPhone ? 'sheet' : 'dialog'}
    />
  );

  // The dialogs and notices after the Send dialog, the same in both layouts.
  const overlays = (
    <>
      <ImportChangeDialog
        isOpen={isImportOpen}
        onClose={closeImport}
        onSubmit={submitImport}
        error={importError}
      />

      <TapNotice editMode={canTapEdit && editMode} unkeyedTapSeq={unkeyedTapSeq} />

      <FirstRunTips
        open={showTips}
        touch={isTouch}
        name={translatorName}
        onNameChange={setTranslatorName}
        onDismiss={dismissTips}
      />

      <LocalePicker
        candidates={localePickerCandidates}
        onChoose={chooseTargetLocale}
        onCancel={cancelLocalePick}
      />
    </>
  );

  const confirmModal = (
    /* Custom Confirmation Modal (replacing window.confirm) */
    <ConfirmModal
      showConfirmModal={showConfirmModal}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
  );

  if (isPhone) {
    // A share link on a phone: the site gets almost the whole screen between a thin top bar
    // and the Edit / Browse switch; the editor and the keys list slide up as sheets.
    const menu = (
      <>
        <AddressBar
          path={navigation.path}
          pendingPath={navigation.pendingPath}
          recent={navigation.recent}
          sitePages={navigation.sitePages}
          onNavigate={navigation.onNavigate}
        />
        <button
          type="button"
          data-closes-menu
          onClick={() => setIsKeysSheetOpen(true)}
          className={PHONE_MENU_ITEM}
        >
          {t('layout.keys')}
        </button>
        <button
          type="button"
          id="studio-changes-button"
          data-closes-menu
          onClick={toggleChanges}
          className={PHONE_MENU_ITEM}
        >
          {t('header.changes')}
          {changesCount > 0 && (
            <span className="glyph-warn px-1.5 py-0.5 rounded-md bg-warning-bg border border-warning-line text-[10px] font-mono font-bold text-warning-fg">
              {changesCount}
            </span>
          )}
        </button>
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{t('theme.group')}</span>
          {themeToggle}
        </div>
      </>
    );

    return (
      <div
        data-testid="studio-root"
        className="w-screen h-dvh flex flex-col bg-app text-fg font-sans select-none overflow-hidden antialiased"
      >
        <TokenModal isOpen={needsToken} onSubmit={submitToken} />

        <PhoneShell
          topBar={
            <PhoneTopBar
              unsentCount={unsentCount}
              canSend={unsentCount + sentCount > 0}
              locale={targetLocale && targetLocale.source === null ? null : locale}
              locales={locales}
              onChooseLocale={handleLocaleChange}
              onSend={mode === 'static' ? openSend : undefined}
              menu={menu}
              closeSignal={navigation.pendingPath ?? navigation.path}
            />
          }
          viewer={viewer(true)}
          editorSheet={
            <PhoneEditorSheet
              selectionCount={selectionCount}
              selectedKey={selected?.key ?? null}
              frameRef={iframeRef}
              onReveal={revealKeyInPage}
            >
              {side(
                canTapEdit ? (
                  <NextMissingButton
                    renderedKeys={renderedKeys}
                    pageKeys={visibleKeys}
                    currentKey={selected?.key ?? null}
                    hasValue={(key) => (localeData[key] ?? '') !== ''}
                    onSelectKey={selectKeyInPage}
                  />
                ) : undefined
              )}
            </PhoneEditorSheet>
          }
          sendSheet={sendDialog}
          bottomBar={
            canTapEdit ? <EditBrowseSwitch editMode={editMode} onChange={setEditMode} /> : null
          }
        />

        <BottomSheet
          open={isKeysSheetOpen}
          onClose={() => setIsKeysSheetOpen(false)}
          labelledBy={PHONE_KEYS_TITLE_ID}
        >
          <h2 id={PHONE_KEYS_TITLE_ID} className="sr-only">
            {t('layout.keys')}
          </h2>
          <div className="h-[60dvh] flex flex-col">
            {keysDirectory((key) => {
              setIsKeysSheetOpen(false);
              pickKey(key);
            })}
          </div>
        </BottomSheet>

        {changesPanel}

        <SetupProblems problems={setupProblems} />

        {confirmModal}

        {overlays}
      </div>
    );
  }

  return (
    <div
      data-testid="studio-root"
      className="w-screen h-screen flex flex-col bg-app text-fg font-sans select-none overflow-hidden antialiased"
    >
      <TokenModal isOpen={needsToken} onSubmit={submitToken} />

      <Header
        coveragePercentage={coveragePercentage}
        mode={mode}
        changesCount={changesCount}
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
        settings={themeToggle}
      />

      {changesPanel}

      <SetupProblems problems={setupProblems} />

      {/* Main Studio Viewport: three columns from 1280px, drawers below. */}
      <StudioLayout
        isWide={isWide}
        openPanel={openPanel}
        onOpenPanelChange={setOpenPanel}
        sideLabel={isReviewing ? t('layout.review') : t('layout.editor')}
        toolbar={
          canTapEdit ? <EditBrowseSwitch editMode={editMode} onChange={setEditMode} /> : undefined
        }
        keys={keysDirectory(pickKey)}
        viewer={viewer(false)}
        side={side()}
      />

      {confirmModal}

      {sendDialog}

      {overlays}
    </div>
  );
};
export default App;
