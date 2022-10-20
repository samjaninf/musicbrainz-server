package MusicBrainz::Server::Data::CoreEntity;

use Moose;
use namespace::autoclean;
use Sql;

extends 'MusicBrainz::Server::Data::Entity';
with 'MusicBrainz::Server::Data::Role::EntityModelClass';
with 'MusicBrainz::Server::Data::Role::GetByGID';
with 'MusicBrainz::Server::Data::Role::MainTable';
with 'MusicBrainz::Server::Data::Role::GID';
with 'MusicBrainz::Server::Data::Role::GIDRedirect';
with 'MusicBrainz::Server::Data::Role::Name';

__PACKAGE__->meta->make_immutable;
no Moose;
1;

=head1 NAME

MusicBrainz::Server::Data::CoreEntity

=head1 COPYRIGHT AND LICENSE

Copyright (C) 2009,2011 Lukas Lalinsky
Copyright (C) 2010 MetaBrainz Foundation

This file is part of MusicBrainz, the open internet music database,
and is licensed under the GPL version 2, or (at your option) any
later version: http://www.gnu.org/licenses/gpl-2.0.txt

=cut
