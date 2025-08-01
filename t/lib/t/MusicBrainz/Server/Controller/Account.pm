package t::MusicBrainz::Server::Controller::Account;
use strict;
use warnings;

use Test::Routine;
use Test::More;
use MusicBrainz::Server::Constants qw( $SPAMMER_FLAG );
use MusicBrainz::Server::Test qw( html_ok );

with 't::Mechanize', 't::Context';

test 'Updated email address is escaped in flash message' => sub {
    my $test = shift;
    my $mech = $test->mech;

    MusicBrainz::Server::Test->prepare_test_database($test->c);

    $mech->get_ok('/login');
    $mech->submit_form(with_fields => {username => 'new_editor', password => 'password'});

    $mech->get_ok('/account/edit');
    $mech->submit_form(with_fields => { 'profile.email' => '"&&&"@example.com' });

    ok($mech->success);
    html_ok($mech->content);
    $mech->content_contains(
        'We have sent you a verification email to ' .
        '<code>&quot;&amp;&amp;&amp;&quot;@example.com</code>.',
    );
};

test 'MBS-14082: Spam accounts are logged out' => sub {
    my $test = shift;
    my $mech = $test->mech;

    MusicBrainz::Server::Test->prepare_test_database($test->c);

    $mech->get_ok('/login');
    $mech->submit_form(with_fields => {username => 'new_editor', password => 'password'});

    $test->c->sql->do(<<~'SQL', $SPAMMER_FLAG);
        UPDATE editor SET privs = privs | ? WHERE name = 'new_editor';
        SQL

    $mech->get_ok('/account/edit');
    is($mech->uri->path, '/', 'The spammer is logged out and redirected to the homepage');
    $mech->content_contains('Log in');
};

1;
