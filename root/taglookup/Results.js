/*
 * @flow strict
 * Copyright (C) 2018 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

import Layout from '../layout/index.js';

import TagLookupForm from './Form.js';
import TagLookupNagSection from './Nag.js';

component TagLookupResults(
  children: React.Node,
  form: TagLookupFormT,
  nag: boolean,
) {
  return (
    <Layout fullWidth title={lp('Tag lookup results', 'audio file metadata')}>
      <div className="content">
        <h1>{lp('Tag lookup results', 'audio file metadata')}</h1>
        {nag ? <TagLookupNagSection /> : null}
        {children}
        <TagLookupForm form={form} />
      </div>
    </Layout>
  );
}

export default TagLookupResults;
