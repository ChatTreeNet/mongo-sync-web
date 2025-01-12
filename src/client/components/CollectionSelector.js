import React from 'react';

const CollectionSelector = ({
  isLoadingCollections,
  availableCollections,
  selectedCollections,
  onCollectionChange,
  config
}) => {
  return (
    <div className="form-group">
      <label>Collections to Sync:</label>
      <div className="collections-container">
        <div className="collections-header">
          <div className="source-header">Source Database</div>
          <div className="target-header">Target Database</div>
        </div>
        {isLoadingCollections ? (
          <div className="collections-loading">Loading collections...</div>
        ) : availableCollections?.sourceCollections ? (
          <div className="collections-grid">
            {/* Source Collections */}
            <div className="source-collections">
              {availableCollections.sourceCollections.map(collection => (
                <div key={collection.name} className={`collection-item ${collection.needsSync ? 'needs-sync' : ''}`}>
                  <label className="collection-label">
                    <input
                      type="checkbox"
                      checked={selectedCollections.includes(collection.name)}
                      onChange={(e) => {
                        onCollectionChange(collection.name, e.target.checked);
                      }}
                    />
                    <div className="collection-info">
                      <span className="collection-name">{collection.name}</span>
                      <span className="collection-count">{collection.count.toLocaleString()} 条记录</span>
                      {collection.needsSync && <span className="sync-badge">需要同步</span>}
                    </div>
                  </label>
                </div>
              ))}
            </div>

            {/* Target Collections */}
            <div className="target-collections">
              {/* Matching collections */}
              {availableCollections.sourceCollections.map(collection => (
                <div key={collection.name} className={`collection-item ${collection.needsSync ? 'needs-sync' : ''}`}>
                  <div className="collection-info">
                    <span className="collection-name">{collection.name}</span>
                    <span className="collection-count">{collection.targetCount.toLocaleString()} 条记录</span>
                    {collection.needsSync && (
                      <span className="diff-count">
                        {collection.count > collection.targetCount ? '+' : ''}
                        {(collection.count - collection.targetCount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {/* Target-only collections */}
              {availableCollections.uniqueTargetCollections.map(collection => (
                <div key={collection.name} className="collection-item target-only">
                  <div className="collection-info">
                    <span className="collection-name">{collection.name}</span>
                    <span className="collection-count">{collection.targetCount.toLocaleString()} 条记录</span>
                    <span className="target-only-badge">仅目标库</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : config.sourceUrl && config.targetUrl ? (
          <div className="collections-empty">No collections found</div>
        ) : (
          <div className="collections-empty">Enter source and target database URLs to load collections</div>
        )}
      </div>
    </div>
  );
};

export default CollectionSelector;
