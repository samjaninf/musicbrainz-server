#!/usr/bin/env perl

use warnings;
use strict;

use FindBin;
use Getopt::Long qw( GetOptions );
use lib "$FindBin::Bin/../lib";

use MusicBrainz::Server::Constants qw( @FULL_SCHEMA_LIST );
use MusicBrainz::Server::Context;
use MusicBrainz::Server::Log qw( log_info );

my $primary_ro_role = 'musicbrainz_ro';
my @other_ro_roles = qw( caa_redirect sir );
my $database = 'MAINTENANCE';
my $grant_privileges = 1;

my $help = <<EOF;
Usage: UpdateDatabasePrivileges.pl [OPTIONS]

By default, this command grants USAGE/SELECT privileges to a set of roles
intended for read-only access. It revokes write privileges.

If `--nogrant` is specified, then it also revokes read privileges
(USAGE/SELECT).

Options are:
        --database          Database to connect to (default: MAINTENANCE)
        --primary-ro-role   Name of the primary READONLY role
                            (default: musicbrainz_ro)
        --other-ro-role     Name of another role allowed RO access to the
                            database (may be specified multiple times)
                            (default: caa_redirect, sir)
        --[no]grant         Whether to GRANT or REVOKE USAGE/SELECT privileges
                            (default: GRANT)
    -h, --help              Show this help

EOF

GetOptions(
    'database=s'        => \$database,
    'primary-ro-role=s' => \$primary_ro_role,
    'other-ro-role=s'   => \@other_ro_roles,
    'grant!'            => \$grant_privileges,
    'help|h'            => sub { print $help; exit },
) or exit 2;
print($help), exit 2 if @ARGV;

my $c = MusicBrainz::Server::Context->create_script_context(
    database => 'SYSTEM_' . $database,
);
my $sql = $c->sql;

$sql->auto_commit;
my $existing_role_names = $sql->select_single_column_array(
    <<~'SQL',
    SELECT rolname
      FROM pg_roles
     WHERE rolname = any(?)
    SQL
    [$primary_ro_role, @other_ro_roles],
);
my %existing_role_names = map { $_ => 1 } @$existing_role_names;

if ($existing_role_names{$primary_ro_role}) {
    my $quoted_primary_role = $sql->dbh->quote_identifier($primary_ro_role);
    $sql->begin;
    my $existing_schemas = $sql->select_single_column_array(
        <<~'SQL',
        SELECT nspname
          FROM pg_namespace
         WHERE nspname = any(?)
        SQL
        [@FULL_SCHEMA_LIST],
    );
    for my $schema (@$existing_schemas) {
        my $quoted_schema = $sql->dbh->quote_identifier($schema);
        log_info {
            "Updating privileges for $quoted_primary_role on $quoted_schema tables in $database"
        };
        my $revoked_privileges;
        if ($grant_privileges) {
            $sql->do(<<~"SQL");
                GRANT USAGE
                   ON SCHEMA $quoted_schema
                   TO $quoted_primary_role;
                SQL
            $revoked_privileges =
                'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
        } else {
            $sql->do(<<~"SQL");
                REVOKE USAGE
                    ON SCHEMA $quoted_schema
                  FROM $quoted_primary_role;
                SQL
            $revoked_privileges = 'ALL PRIVILEGES';
        }
        $sql->do(<<~"SQL");
            REVOKE $revoked_privileges
                ON ALL TABLES IN SCHEMA $quoted_schema
              FROM $quoted_primary_role;
            SQL
        $sql->do(<<~"SQL") if $grant_privileges;
            GRANT SELECT
               ON ALL TABLES IN SCHEMA $quoted_schema
               TO $quoted_primary_role;
            SQL
    }
    for my $other_role (@other_ro_roles) {
        unless ($existing_role_names{$other_role}) {
            log_info {
                qq(The role "$other_role" does not exist; skipping.)
            };
            next;
        }

        my $quoted_other_role = $sql->dbh->quote_identifier($other_role);
        for my $schema (@$existing_schemas) {
            my $quoted_schema = $sql->dbh->quote_identifier($schema);
            log_info {
                "Updating privileges for $quoted_other_role on $quoted_schema tables in $database"
            };
            $sql->do(<<~"SQL");
                REVOKE ALL PRIVILEGES
                    ON ALL TABLES IN SCHEMA $quoted_schema
                  FROM $quoted_other_role;
                REVOKE USAGE
                    ON SCHEMA $quoted_schema
                  FROM $quoted_other_role;
                SQL
        }
        if ($grant_privileges) {
            $sql->do(<<~"SQL");
                GRANT $quoted_primary_role
                   TO $quoted_other_role;
                SQL
        } else {
            $sql->do(<<~"SQL");
                REVOKE $quoted_primary_role
                  FROM $quoted_other_role;
                SQL
        }
    }
    $sql->commit;
} else {
    log_info {
        qq(The role "$primary_ro_role" does not exist; skipping.)
    };
}

=head1 COPYRIGHT AND LICENSE

Copyright (C) 2024 MetaBrainz Foundation

This file is part of MusicBrainz, the open internet music database,
and is licensed under the GPL version 2, or (at your option) any
later version: http://www.gnu.org/licenses/gpl-2.0.txt

=cut
