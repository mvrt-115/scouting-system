'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

export type PageVisibility = {
  showPicklist: boolean;
  showSuperScoutViewer: boolean;
  showDataViewer: boolean;
  showLegacyDataViewer: boolean;
};

const defaultVisibility: PageVisibility = {
  showPicklist: false,
  showSuperScoutViewer: false,
  showDataViewer: false,
  showLegacyDataViewer: false,
};

export const PAGE_VISIBILITY_EVENT = 'page-visibility-updated';

export function usePageVisibility() {
  const { user } = useAuth();
  const [pageVisibility, setPageVisibility] = useState<PageVisibility>(defaultVisibility);
  const [isLoadingVisibility, setIsLoadingVisibility] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadVisibility = async () => {
      try {
        const visibilityDoc = user
          ? await getDoc(doc(db, 'users', user.uid))
          : await getDoc(doc(db, 'settings', 'pageVisibility'));
        if (!isMounted) return;

        if (visibilityDoc.exists()) {
          setPageVisibility({
            ...defaultVisibility,
            ...((user ? (visibilityDoc.data() as any)?.pageVisibility : visibilityDoc.data()) as Partial<PageVisibility>),
          });
        } else {
          setPageVisibility(defaultVisibility);
        }
      } catch {
        if (isMounted) {
          setPageVisibility(defaultVisibility);
        }
      } finally {
        if (isMounted) {
          setIsLoadingVisibility(false);
        }
      }
    };

    loadVisibility();

    const handleVisibilityUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<PageVisibility>;
      if (customEvent.detail && isMounted) {
        setPageVisibility({
          ...defaultVisibility,
          ...customEvent.detail,
        });
        setIsLoadingVisibility(false);
      } else {
        loadVisibility();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(PAGE_VISIBILITY_EVENT, handleVisibilityUpdate);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(PAGE_VISIBILITY_EVENT, handleVisibilityUpdate);
      }
    };
  }, [user]);

  return { pageVisibility, isLoadingVisibility };
}
