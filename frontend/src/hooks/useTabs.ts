import { useState, useCallback } from 'react';

export type TabId = "members" | "routes" | "recommendations" | "explore";

export function useTabs(initialTab: TabId = "members") {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  
  const switchTab = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);
  
  return {
    activeTab,
    switchTab,
    isActive: (tabId: TabId) => activeTab === tabId
  };
} 