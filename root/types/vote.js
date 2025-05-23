/*
 * @flow strict
 * Copyright (C) 2017 MetaBrainz Foundation
 *
 * This file is part of MusicBrainz, the open internet music database,
 * and is licensed under the GPL version 2, or (at your option) any
 * later version: http://www.gnu.org/licenses/gpl-2.0.txt
 */

/* eslint-disable @stylistic/no-multi-spaces */
/* eslint-disable no-unused-vars */

declare type VoteOptionT =
  | -2   // None
  | -1   // Abstain
  |  0   // No
  |  1   // Yes
  |  2  // Approve
  |  3  // Admin approve
  |  4;  // Admin reject
/* eslint-enable @stylistic/no-multi-spaces */

// MusicBrainz::Server::Entity::Vote::TO_JSON
declare type VoteT = {
  +editor_id: number,
  +superseded: boolean,
  +vote: VoteOptionT,
  +vote_time: string,
};
