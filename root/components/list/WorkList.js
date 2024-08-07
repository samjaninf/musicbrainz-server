/*
 * @flow strict
 * Copyright (C) 2019 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

import * as React from 'react';

import {CatalystContext} from '../../context.mjs';
import useTable from '../../hooks/useTable.js';
import manifest from '../../static/manifest.mjs';
import {
  attributesColumn,
  defineArtistRolesColumn,
  defineCheckboxColumn,
  defineNameColumn,
  defineRatingsColumn,
  defineSeriesNumberColumn,
  defineTypeColumn,
  iswcsColumn,
  removeFromMergeColumn,
  workArtistsColumn,
  workLanguagesColumn,
} from '../../utility/tableColumns.js';

component WorkList(
  checkboxes?: string,
  mergeForm?: MergeFormT,
  order?: string,
  seriesItemNumbers?: $ReadOnlyArray<string>,
  showRatings: boolean = false,
  sortable?: boolean,
  works: $ReadOnlyArray<WorkT>,
) {
  const $c = React.useContext(CatalystContext);

  const columns = React.useMemo(
    () => {
      const checkboxColumn = $c.user && (nonEmpty(checkboxes) || mergeForm)
        ? defineCheckboxColumn({mergeForm, name: checkboxes})
        : null;
      const seriesNumberColumn = seriesItemNumbers
        ? defineSeriesNumberColumn({seriesItemNumbers})
        : null;
      const nameColumn = defineNameColumn<WorkT>({
        order,
        sortable,
        title: l('Work'),
      });
      const writersColumn = defineArtistRolesColumn<WorkT>({
        columnName: 'writers',
        getRoles: entity => entity.writers,
        title: l('Writers'),
      });
      const typeColumn = defineTypeColumn({
        order,
        sortable,
        typeContext: 'work_type',
      });
      const ratingsColumn = defineRatingsColumn<WorkT>({
        getEntity: entity => entity,
      });

      return [
        ...(checkboxColumn ? [checkboxColumn] : []),
        ...(seriesNumberColumn ? [seriesNumberColumn] : []),
        nameColumn,
        writersColumn,
        workArtistsColumn,
        iswcsColumn,
        typeColumn,
        workLanguagesColumn,
        attributesColumn,
        ...(showRatings ? [ratingsColumn] : []),
        ...(mergeForm && works.length > 2 ? [removeFromMergeColumn] : []),
      ];
    },
    [
      $c.user,
      checkboxes,
      mergeForm,
      order,
      seriesItemNumbers,
      showRatings,
      sortable,
      works,
    ],
  );

  const table = useTable<WorkT>({columns, data: works});

  return (
    <>
      {table}
      {manifest('common/components/ArtistRoles', {async: 'async'})}
      {manifest('common/components/AttributeList', {async: 'async'})}
      {manifest('common/components/IswcList', {async: 'async'})}
      {manifest('common/components/WorkArtists', {async: 'async'})}
    </>
  );
}

export default WorkList;
