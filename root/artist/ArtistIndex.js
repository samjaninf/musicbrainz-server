/*
 * @flow strict-local
 * Copyright (C) 2019 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

import * as React from 'react';

import CleanupBanner from '../components/CleanupBanner.js';
import RecordingList from '../components/list/RecordingList.js';
import ReleaseGroupList from '../components/list/ReleaseGroupList.js';
import PaginatedResults from '../components/PaginatedResults.js';
import RelatedEntitiesDisplay from '../components/RelatedEntitiesDisplay.js';
import {SanitizedCatalystContext} from '../context.mjs';
import manifest from '../static/manifest.mjs';
import Annotation from '../static/scripts/common/components/Annotation.js';
import DescriptiveLink
  from '../static/scripts/common/components/DescriptiveLink.js';
import Filter from '../static/scripts/common/components/Filter.js';
import {type ReleaseGroupFilterT}
  from '../static/scripts/common/components/FilterForm.js';
import ListMergeButtonsRow
  from '../static/scripts/common/components/ListMergeButtonsRow.js';
import WikipediaExtract
  from '../static/scripts/common/components/WikipediaExtract.js';
import commaOnlyList, {commaOnlyListText}
  from '../static/scripts/common/i18n/commaOnlyList.js';
import {bracketedText} from '../static/scripts/common/utility/bracketed.js';
import {returnToCurrentPage} from '../utility/returnUri.js';
import uriWith from '../utility/uriWith.js';

import ArtistLayout from './ArtistLayout.js';

component FooterSwitch(
  $c: CatalystContextT,
  hasDefault: boolean,
  hasExtra: boolean,
  hasVariousArtists: boolean,
  hasVariousArtistsExtra: boolean,
  includingAllStatuses: boolean,
  showingVariousArtistsOnly: boolean,
) {
  const artistLink = $c.req.uri;

  function buildLinks(
    showDefault: boolean,
    showAll: boolean,
    showVA: boolean,
    showAllVA: boolean,
  ) {
    const links = [];
    if (showDefault) {
      links.push(
        <a
          href={uriWith(artistLink, {all: 0, va: 0})}
          key="show-default"
        >
          {l('Show official release groups')}
        </a>,
      );
    }
    if (showAll) {
      links.push(
        <a
          href={uriWith(artistLink, {all: 1, va: 0})}
          key="show-all"
        >
          {l('Show all release groups')}
        </a>,
      );
    }
    if (showVA) {
      links.push(
        <a
          href={uriWith(artistLink, {all: 0, va: 1})}
          key="show-va"
        >
          {l('Show official various artist release groups')}
        </a>,
      );
    }
    if (showAllVA) {
      links.push(
        <a
          href={uriWith(artistLink, {all: 1, va: 1})}
          key="show-all-va"
        >
          {l('Show all various artist release groups')}
        </a>,
      );
    }

    if (links.length) {
      return (
        <>
          {' ('}
          {links.reduce((accum: Array<React.Node>, link, index) => {
            accum.push(link);
            if (index < (links.length - 1)) {
              accum.push(' / ');
            }
            return accum;
          }, [])}
          {')'}
        </>
      );
    }
    // If no links are built, finish the line with a period instead
    return '.';
  }

  return (
    showingVariousArtistsOnly && includingAllStatuses ? (
      <>
        {(!hasDefault && !hasExtra && !hasVariousArtists) ? (
          <p>
            {l(`This artist only has unofficial release groups by
                various artists.`)}
          </p>
        ) : null}
        <p>
          {(hasVariousArtists || hasVariousArtistsExtra)
            ? l('Showing all release groups for various artists')
            : l(`This artist does not have any various artists
                 release groups`)}
          {buildLinks(hasDefault, hasExtra, hasVariousArtists, false)}
        </p>
      </>
    ) : showingVariousArtistsOnly ? (
      <>
        {(!hasDefault && !hasExtra) ? (
          <p>
            {l('This artist only has release groups by various artists.')}
          </p>
        ) : null}
        <p>
          {l('Showing official release groups for various artists')}
          {buildLinks(hasDefault, hasExtra, false, hasVariousArtistsExtra)}
        </p>
      </>
    ) : includingAllStatuses ? (
      <>
        {hasDefault ? null : (
          <p>
            {l('This artist only has unofficial release groups.')}
          </p>
        )}
        <p>
          {l('Showing all release groups by this artist')}
          {buildLinks(
            hasDefault,
            false,
            hasVariousArtists,
            hasVariousArtistsExtra,
          )}
        </p>
      </>
    ) : (
      <p>
        {l('Showing official release groups by this artist')}
        {buildLinks(
          false,
          hasExtra,
          hasVariousArtists,
          hasVariousArtistsExtra,
        )}
      </p>
    )
  );
}

component ArtistIndex(
  ajaxFilterFormUrl: string,
  artist: ArtistT,
  baseName: ?ArtistT,
  baseNameLegalNameAliases: ?$ReadOnlyArray<string>,
  eligibleForCleanup: boolean,
  filterForm: ?ReleaseGroupFilterT,
  hasFilter: boolean,
  legalNameAliases: ?$ReadOnlyArray<string>,
  numberOfRevisions: number,
  otherIdentities: $ReadOnlyArray<ArtistT>,
  pager: PagerT,
  recordings: ?$ReadOnlyArray<RecordingWithArtistCreditT>,
  releaseGroups: ?$ReadOnlyArray<ReleaseGroupT>,
  renamedFrom: $ReadOnlyArray<ArtistT>,
  renamedInto: $ReadOnlyArray<ArtistT>,
  wikipediaExtract: WikipediaExtractT,
  ...footerSwitchProps: React.PropsOf<FooterSwitch>
) {
  const $c = React.useContext(SanitizedCatalystContext);
  const existingRecordings = recordings?.length ? recordings : null;
  const existingReleaseGroups = releaseGroups?.length ? releaseGroups : null;


  return (
    <ArtistLayout entity={artist} page="index">
      {eligibleForCleanup ? (
        <CleanupBanner entityType="artist" />
      ) : null}

      <Annotation
        annotation={artist.latest_annotation}
        collapse
        entity={artist}
        numberOfRevisions={numberOfRevisions}
      />

      {baseName ? (
        <RelatedEntitiesDisplay title={l('Performance name of')}>
          <DescriptiveLink entity={baseName} />
          {baseNameLegalNameAliases
            ? ' ' + bracketedText(commaOnlyListText(baseNameLegalNameAliases))
            : null}
        </RelatedEntitiesDisplay>

      ) : legalNameAliases?.length ? (
        <RelatedEntitiesDisplay title={l('Legal name')}>
          {commaOnlyListText(legalNameAliases)}
        </RelatedEntitiesDisplay>
      ) : null}

      {renamedFrom.length ? (
        <RelatedEntitiesDisplay title={l('Previously known as')}>
          {commaOnlyList(renamedFrom.map(
            label => <DescriptiveLink entity={label} key={label.gid} />,
          ))}
        </RelatedEntitiesDisplay>
      ) : null}
      {renamedInto.length ? (
        <RelatedEntitiesDisplay title={l('Renamed to')}>
          {commaOnlyList(renamedInto.map(
            label => <DescriptiveLink entity={label} key={label.gid} />,
          ))}
        </RelatedEntitiesDisplay>
      ) : null}

      {otherIdentities?.length ? (
        <RelatedEntitiesDisplay title={l('Also performs as')}>
          {commaOnlyList(
            otherIdentities.map(a => (
              <DescriptiveLink entity={a} key={a.id} />
            )),
          )}
        </RelatedEntitiesDisplay>
      ) : null}

      <WikipediaExtract
        cachedWikipediaExtract={wikipediaExtract || null}
        entity={artist}
      />

      <h2 className="discography">{l('Discography')}</h2>

      <Filter
        ajaxFormUrl={ajaxFilterFormUrl}
        initialFilterForm={filterForm}
        showAllReleaseGroups={footerSwitchProps.includingAllStatuses}
        showVAReleaseGroups={footerSwitchProps.showingVariousArtistsOnly}
      />

      {existingReleaseGroups ? (
        <form
          action={'/release_group/merge_queue?' + returnToCurrentPage($c)}
          method="post"
        >
          <PaginatedResults pager={pager}>
            <ReleaseGroupList
              checkboxes="add-to-merge"
              releaseGroups={existingReleaseGroups}
              showRatings
            />
          </PaginatedResults>
          {$c.user ? (
            <>
              <ListMergeButtonsRow
                label={l('Merge release groups')}
              />
              {manifest(
                'common/components/ListMergeButtonsRow',
                {async: true},
              )}
            </>
          ) : null}
        </form>
      ) : null}

      {existingRecordings ? (
        <form
          action={'/recording/merge_queue?' + returnToCurrentPage($c)}
          method="post"
        >
          <PaginatedResults pager={pager}>
            <RecordingList
              checkboxes="add-to-merge"
              recordings={existingRecordings}
              showRatings
            />
          </PaginatedResults>
          {$c.user ? (
            <>
              <ListMergeButtonsRow
                label={l('Add selected recordings for merging')}
              />
              {manifest(
                'common/components/ListMergeButtonsRow',
                {async: true},
              )}
            </>
          ) : null}
        </form>
      ) : null}

      {existingRecordings ? (
        <p>
          {l(
            'This artist has no release groups, only standalone recordings.',
          )}
        </p>
      ) : (
        <>
          {(!existingReleaseGroups && hasFilter) ? (
            <p>{l('No release groups found that match this search.')}</p>
          ) : null}

          <FooterSwitch $c={$c} {...footerSwitchProps} />
        </>
      )}

      {manifest('artist/index', {async: true})}
    </ArtistLayout>
  );
}

export default ArtistIndex;
