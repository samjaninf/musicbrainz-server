/*
 * @flow strict
 * Copyright (C) 2020 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

import SearchError from '../components/SearchError.js';

component General(form: SearchFormT | TagLookupFormT, query: string) {
  return (
    <SearchError form={form}>
      <p>
        {exp.l(
          `Sorry, but your query “(<code>{query}</code>)” could not be
           performed, due to an error which we are
           not quite able to identify.`,
          {query},
        )}
      </p>
    </SearchError>
  );
}

export default General;
