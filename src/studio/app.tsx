import React from 'react';
import {
  Header,
  KeysDirectory,
  IframeViewer,
  EditorPanel,
  ConfirmModal,
  ChangesPanel,
  TokenModal,
  useStudio,
} from './features/dashboard/index.js';

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
  } = useStudio();

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0f19] text-slate-100 font-sans select-none overflow-hidden antialiased">
      <TokenModal isOpen={needsToken} onSubmit={submitToken} />

      <Header
        coveragePercentage={coveragePercentage}
        mode={mode}
        changesCount={git?.changes.length ?? 0}
        isChangesOpen={isChangesOpen}
        onToggleChanges={toggleChanges}
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

        {/* Column 2: App Preview Frame */}
        <IframeViewer
          iframeRef={iframeRef}
          appOrigin={appOrigin}
          connectionStatus={connectionStatus}
          currentPath={currentPath}
        />

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
