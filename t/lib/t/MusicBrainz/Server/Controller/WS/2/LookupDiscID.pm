package t::MusicBrainz::Server::Controller::WS::2::LookupDiscID;
use utf8;
use strict;
use warnings;

use HTTP::Status qw( :constants );
use Test::Routine;
use Test::More;

with 't::Mechanize', 't::Context';

use Test::XML::SemanticCompare qw( is_xml_same );
use MusicBrainz::Server::Test ws_test => {
    version => 2,
};

test all => sub {

my $test = shift;
my $c = $test->c;
my $mech = $test->mech;
$mech->default_header('Accept' => 'application/xml');

MusicBrainz::Server::Test->prepare_test_database($c, '+tracklist');
MusicBrainz::Server::Test->prepare_test_database($c, <<~'SQL');
    INSERT INTO medium_cdtoc (medium, cdtoc) VALUES (2, 2);
    INSERT INTO tag (id, name) VALUES (1, 'musical'), (2, 'not-used');
    INSERT INTO genre (id, gid, name)
        VALUES (1, 'ff6d73e8-bf1a-431e-9911-88ae7ffcfdfb', 'musical');
    INSERT INTO release_tag (tag, release, count) VALUES (1, 2, 2), (2, 2, 2);
    SQL

ws_test 'direct disc id lookup',
    '/discid/IeldkVfIh1wep_M8CMuDvA0nQ7Q-' =>
    '<?xml version="1.0"?>
<metadata xmlns="http://musicbrainz.org/ns/mmd-2.0#">
  <disc id="IeldkVfIh1wep_M8CMuDvA0nQ7Q-">
    <sectors>189343</sectors>
    <offset-list count="9">
      <offset position="1">150</offset>
      <offset position="2">6614</offset>
      <offset position="3">32287</offset>
      <offset position="4">54041</offset>
      <offset position="5">61236</offset>
      <offset position="6">88129</offset>
      <offset position="7">92729</offset>
      <offset position="8">115276</offset>
      <offset position="9">153877</offset>
    </offset-list>
    <release-list count="1">
      <release id="f205627f-b70a-409d-adbe-66289b614e80">
        <title>Aerial</title>
        <quality>normal</quality>
        <date>2007</date>
        <release-event-list count="1">
          <release-event>
            <date>2007</date>
          </release-event>
        </release-event-list>
        <cover-art-archive>
            <artwork>false</artwork>
            <count>0</count>
            <front>false</front>
            <back>false</back>
        </cover-art-archive>
        <medium-list count="2">
          <medium id="85e53b98-2183-4637-bd19-0adfb30b573c">
            <title>A Sea of Honey</title>
            <position>1</position>
            <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
            <disc-list count="0" />
            <track-list count="7" />
          </medium>
          <medium id="d4839595-9c34-4c2d-9dd9-260e433c4638">
            <title>A Sky of Honey</title>
            <position>2</position>
            <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
            <disc-list count="1">
              <disc id="IeldkVfIh1wep_M8CMuDvA0nQ7Q-">
                <sectors>189343</sectors>
                <offset-list count="9">
                  <offset position="1">150</offset>
                  <offset position="2">6614</offset>
                  <offset position="3">32287</offset>
                  <offset position="4">54041</offset>
                  <offset position="5">61236</offset>
                  <offset position="6">88129</offset>
                  <offset position="7">92729</offset>
                  <offset position="8">115276</offset>
                  <offset position="9">153877</offset>
                </offset-list>
              </disc>
            </disc-list>
            <track-list count="9" />
          </medium>
        </medium-list>
      </release>
    </release-list>
  </disc>
</metadata>';

$c->model('DurationLookup')->update(2);
$c->model('DurationLookup')->update(4);
ws_test 'lookup via toc',
    '/discid/aa11.sPglQ1x0cybDcDi0OsZw9Q-?toc=1 9 189343 150 6614 32287 54041 61236 88129 92729 115276 153877&cdstubs=no&inc=tags+genres' =>
    '<?xml version="1.0"?>
<metadata xmlns="http://musicbrainz.org/ns/mmd-2.0#">
  <release-list count="2">
    <release id="f205627f-b70a-409d-adbe-66289b614e80">
      <title>Aerial</title>
      <quality>normal</quality>
      <date>2007</date>
      <release-event-list count="1">
        <release-event>
          <date>2007</date>
        </release-event>
      </release-event-list>
      <cover-art-archive>
          <artwork>false</artwork>
          <count>0</count>
          <front>false</front>
          <back>false</back>
      </cover-art-archive>
      <medium-list count="2">
        <medium id="85e53b98-2183-4637-bd19-0adfb30b573c">
          <title>A Sea of Honey</title>
          <position>1</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="7" />
        </medium>
        <medium id="d4839595-9c34-4c2d-9dd9-260e433c4638">
          <title>A Sky of Honey</title>
          <position>2</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="1">
            <disc id="IeldkVfIh1wep_M8CMuDvA0nQ7Q-">
              <sectors>189343</sectors>
              <offset-list count="9">
                <offset position="1">150</offset>
                <offset position="2">6614</offset>
                <offset position="3">32287</offset>
                <offset position="4">54041</offset>
                <offset position="5">61236</offset>
                <offset position="6">88129</offset>
                <offset position="7">92729</offset>
                <offset position="8">115276</offset>
                <offset position="9">153877</offset>
              </offset-list>
            </disc>
          </disc-list>
          <track-list count="9" />
        </medium>
      </medium-list>
    </release>
    <release id="9b3d9383-3d2a-417f-bfbb-56f7c15f075b">
      <title>Aerial</title>
      <quality>normal</quality>
      <date>2008</date>
      <release-event-list count="1">
        <release-event>
          <date>2008</date>
        </release-event>
      </release-event-list>
      <cover-art-archive>
          <artwork>false</artwork>
          <count>0</count>
          <front>false</front>
          <back>false</back>
      </cover-art-archive>
      <medium-list count="2">
        <medium id="cce58ecb-3872-49e2-ac29-44397e265c61">
          <title>A Sea of Honey</title>
          <position>1</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="7" />
        </medium>
        <medium id="8f9bf81c-cfda-4689-a9a7-55f57fb4b9c2">
          <title>A Sky of Honey</title>
          <position>2</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="9" />
        </medium>
      </medium-list>
      <genre-list>
        <genre count="2" id="ff6d73e8-bf1a-431e-9911-88ae7ffcfdfb">
          <name>musical</name>
        </genre>
      </genre-list>
      <tag-list>
        <tag count="2">
          <name>musical</name>
        </tag>
        <tag count="2">
          <name>not-used</name>
        </tag>
      </tag-list>
    </release>
  </release-list>
</metadata>';

subtest 'lookup of invalid discid with no toc parameter' => sub {
    $mech->get('/ws/2/discid/-');
    is(
      $mech->status,
      HTTP_BAD_REQUEST,
      'lookup of invalid discid with no toc parameter still fails',
    );
    is_xml_same($mech->content, q{<?xml version="1.0"?>
    <error>
      <text>Invalid discid.</text>
      <text>For usage, please see: https://musicbrainz.org/development/mmd</text>
    </error>});
};

ws_test 'lookup via toc with invalid discid parameter',
    '/discid/-?toc=1 9 189343 150 6614 32287 54041 61236 88129 92729 115276 153877&cdstubs=no' =>
    '<?xml version="1.0"?>
<metadata xmlns="http://musicbrainz.org/ns/mmd-2.0#">
  <release-list count="2">
    <release id="f205627f-b70a-409d-adbe-66289b614e80">
      <title>Aerial</title>
      <quality>normal</quality>
      <date>2007</date>
      <release-event-list count="1">
        <release-event>
          <date>2007</date>
        </release-event>
      </release-event-list>
      <cover-art-archive>
          <artwork>false</artwork>
          <count>0</count>
          <front>false</front>
          <back>false</back>
      </cover-art-archive>
      <medium-list count="2">
        <medium id="85e53b98-2183-4637-bd19-0adfb30b573c">
          <title>A Sea of Honey</title>
          <position>1</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="7" />
        </medium>
        <medium id="d4839595-9c34-4c2d-9dd9-260e433c4638">
          <title>A Sky of Honey</title>
          <position>2</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="1">
            <disc id="IeldkVfIh1wep_M8CMuDvA0nQ7Q-">
              <sectors>189343</sectors>
              <offset-list count="9">
                <offset position="1">150</offset>
                <offset position="2">6614</offset>
                <offset position="3">32287</offset>
                <offset position="4">54041</offset>
                <offset position="5">61236</offset>
                <offset position="6">88129</offset>
                <offset position="7">92729</offset>
                <offset position="8">115276</offset>
                <offset position="9">153877</offset>
              </offset-list>
            </disc>
          </disc-list>
          <track-list count="9" />
        </medium>
      </medium-list>
    </release>
    <release id="9b3d9383-3d2a-417f-bfbb-56f7c15f075b">
      <title>Aerial</title>
      <quality>normal</quality>
      <date>2008</date>
      <release-event-list count="1">
        <release-event>
          <date>2008</date>
        </release-event>
      </release-event-list>
      <cover-art-archive>
          <artwork>false</artwork>
          <count>0</count>
          <front>false</front>
          <back>false</back>
      </cover-art-archive>
      <medium-list count="2">
        <medium id="cce58ecb-3872-49e2-ac29-44397e265c61">
          <title>A Sea of Honey</title>
          <position>1</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="7" />
        </medium>
        <medium id="8f9bf81c-cfda-4689-a9a7-55f57fb4b9c2">
          <title>A Sky of Honey</title>
          <position>2</position>
          <format id="52014420-cae8-11de-8a39-0800200c9a26">Format</format>
          <disc-list count="0" />
          <track-list count="9" />
        </medium>
      </medium-list>
    </release>
  </release-list>
</metadata>';

};

1;

