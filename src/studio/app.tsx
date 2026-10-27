import React from 'react';
import {
  Header,
  KeysDirectory,
  IframeViewer,
  EditorPanel,
  ConfirmModal,
  ChangesPanel,
  TokenModal,
  SetupProblems,
  useStudio,
} from './features/dashboard/index.js';
import { isAppPreviewBlocked } from './runtime.js';

export const App = () => {
  const {
    selected,
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
    unsentCount,
  } = useStudio();

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
      />

      <SetupProblems problems={setupProblems} />

      {/* Main Studio Viewport (Upgraded to 3-column layout) */}
      <main className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0 bg-linear-to-b from-[#0b0f19] to-[#070a10]">
        {/* Column 1: Searchable Keys Directory */}
        <KeysDirectory
          filteredKeys={filteredKeys}
          selected={selected}
          localeData={localeData}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterPageOnly={filterPageOnly}
          setFilterPageOnly={setFilterPageOnly}
          visibleKeys={visibleKeys}
          selectKeyDirectly={selectKeyDirectly}
        />

        {/* Column 2: App Preview Frame. A share-folder Studio without a usable manifest
            has no app to point at, so it shows only the setup problem above. */}
        {isAppPreviewBlocked() ? (
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
        )}

        {/* Column 3: Value Editing Panel */}
        <EditorPanel
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
      </main>

      {/* Custom Confirmation Modal (replacing window.confirm) */}
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
};
export default App;
