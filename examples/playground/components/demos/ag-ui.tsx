'use client';

import dynamic from 'next/dynamic';

// Client only: it brings @ag-ui/client, which nothing else on the page needs.
export const AgUiDemo = dynamic(() => import('../ag-ui-demo'), { ssr: false });
