/*
 * @flow strict
 * Copyright (C) 2020 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

import * as React from 'react';

import {SanitizedCatalystContext} from '../../context.mjs';
import Layout from '../../layout/index.js';
import expand2react from '../../static/scripts/common/i18n/expand2react.js';
import bracketed, {bracketedText}
  from '../../static/scripts/common/utility/bracketed.js';
import {isRelationshipEditor}
  from '../../static/scripts/common/utility/privileges.js';
import {upperFirst} from '../../static/scripts/common/utility/strings.js';
import RelationshipsHeader from '../RelationshipsHeader.js';
import compareChildren from '../utility/compareChildren.js';

component AttributeDetails(
  attribute: LinkAttrTypeT,
  topLevel: boolean = false,
) {
  const $c = React.useContext(SanitizedCatalystContext);
  const isInstrumentRoot = attribute.id === 14;
  const childrenAttrs = attribute.children || [];
  const translatedDescription = attribute.description
    ? expand2react(l_relationships(attribute.description))
    : lp('none', 'relationship attribute description');
  const descriptionSection = topLevel
    ? translatedDescription
    : bracketed(translatedDescription);

  return (
    isRelationshipEditor($c.user) ? (
      <>
        {descriptionSection}
        {' '}
        {bracketedText(attribute.child_order.toString())}
        {' [ '}
        {isInstrumentRoot ? null : (
          <>
            <a
              href={'/relationship-attributes/create?parent=' + attribute.gid}
            >
              {l_admin('Add child')}
            </a>
            {' | '}
          </>
        )}
        <a href={'/relationship-attribute/' + attribute.gid + '/edit'}>
          {l_admin('Edit')}
        </a>
        {childrenAttrs.length ? null : (
          <>
            {' | '}
            <a href={'/relationship-attribute/' + attribute.gid + '/delete'}>
              {l_admin('Remove')}
            </a>
          </>
        )}
        {' | '}
        <a href={'/relationship-attribute/' + attribute.gid}>
          {l('Documentation')}
        </a>
        {' ]'}

      </>
    ) : (
      <>
        {attribute.description && attribute.description !== attribute.name
          ? descriptionSection
          : null}
        {' [ '}
        <a href={'/relationship-attribute/' + attribute.gid}>
          {l('Documentation')}
        </a>
        {' ]'}
      </>
    )
  );
}

component AttributeTree(attribute: LinkAttrTypeT) {
  const childrenAttrs = attribute.children || [];
  return (
    <li style={{marginTop: '0.25em'}}>
      <strong>{upperFirst(l_relationships(attribute.name))}</strong>

      {' '}

      <AttributeDetails attribute={attribute} />

      {childrenAttrs.length ? (
        <ul>
          {childrenAttrs
            .slice(0)
            .sort(compareChildren)
            .map(attribute => (
              <AttributeTree
                attribute={attribute}
                key={attribute.id}
              />
            ))}
        </ul>
      ) : null}
    </li>
  );
}

component AttributesList(root: LinkAttrTypeT) {
  const childrenAttrs = root.children || [];
  return (
    childrenAttrs.length ? (
      childrenAttrs
        .slice(0)
        .sort(compareChildren)
        .map(attribute => {
          const childrenAttrs = attribute.children || [];
          return (
            <>
              <h2 id={attribute.name}>
                {upperFirst(l_relationships(attribute.name))}
              </h2>

              <AttributeDetails attribute={attribute} topLevel />

              {childrenAttrs.length ? (
                <>
                  <br />
                  <br />
                  {addColonText(l('Possible values'))}
                  <ul>
                    {childrenAttrs
                      .slice(0)
                      .sort(compareChildren)
                      .map(attribute => (
                        <AttributeTree
                          attribute={attribute}
                          key={attribute.id}
                        />
                      ))}
                  </ul>
                </>
              ) : null}
            </>
          );
        })
    ) : (
      <p>{l('No relationship attributes found.')}</p>
    )
  );
}

component RelationshipAttributeTypesList(root: LinkAttrTypeT) {
  const $c = React.useContext(SanitizedCatalystContext);
  return (
    <Layout fullWidth noIcons title={l('Relationship attributes')}>
      <div id="content">
        <RelationshipsHeader page="attributes" />
        {isRelationshipEditor($c.user) ? (
          <p>
            <a href="/relationship-attributes/create">
              {l_admin('Add a new relationship attribute')}
            </a>
          </p>
        ) : null}
        <AttributesList root={root} />
      </div>
    </Layout>
  );
}

export default RelationshipAttributeTypesList;
