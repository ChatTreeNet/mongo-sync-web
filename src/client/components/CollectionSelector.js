import React from 'react';
import { useTranslation } from 'react-i18next';

const CollectionSelector = ({
  isLoadingCollections,
  availableCollections,
  selectedCollections,
  onCollectionChange,
  config
}) => {
  const { t } = useTranslation();

  return (
    <div className="form-group">
      <label>{t('collections.title')}:</label>
      <div className="collections-container">
        <div className="collections-header">
          <div className="source-header">{t('database.sourceDb')}</div>
          <div className="target-header">{t('database.targetDb')}</div>
        </div>
        {isLoadingCollections ? (
          <div className="collections-loading">{t('collections.loading')}</div>
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
                      <span className="collection-count">
                        {collection.count.toLocaleString()} {t('collections.records')}
                      </span>
                      {collection.needsSync && (
                        <span className="sync-badge">{t('collections.needsSync')}</span>
                      )}
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
                    <span className="collection-count">
                      {collection.targetCount.toLocaleString()} {t('collections.records')}
                    </span>
                    {collection.needsSync && (
                      <span className="diff-count">
                        {collection.count > collection.targetCount 
                          ? t('collections.difference.more', { count: collection.count - collection.targetCount })
                          : t('collections.difference.less', { count: collection.targetCount - collection.count })
                        }
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
                    <span className="collection-count">
                      {collection.targetCount.toLocaleString()} {t('collections.records')}
                    </span>
                    <span className="target-only-badge">{t('collections.targetOnly')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : config.sourceUrl && config.targetUrl ? (
          <div className="collections-empty">{t('collections.empty')}</div>
        ) : (
          <div className="collections-empty">{t('collections.enterUrls')}</div>
        )}
      </div>
    </div>
  );
};

export default CollectionSelector;
