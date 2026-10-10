'use client';

import { Sources } from 'signoff-ui';
import { sources } from '@/lib/demo-data';

export function SourcesDemo() {
  return (
    <div className="flex flex-col gap-6">
      <Sources sources={sources} idPrefix="chips" />
      <Sources sources={sources} variant="cards" idPrefix="cards" />
    </div>
  );
}
