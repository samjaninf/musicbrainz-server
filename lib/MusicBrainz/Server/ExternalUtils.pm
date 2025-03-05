package MusicBrainz::Server::ExternalUtils;
use strict;
use warnings;

use base 'Exporter';
use Data::Dumper;
use MusicBrainz::Server::Log qw( log_error );

our @EXPORT_OK = qw(
    get_chunked_with_retry
);

sub get_chunked_with_retry {
    my ($ua, $url) = @_;
    my $response;
    my $retries_remaining = int(25.0 / $ua->timeout);
    while (!defined($response) && --$retries_remaining > 0) {
        $response = $ua->get($url);

        log_error {
            "Failed to get $url in get_chunked_with_retry:\n" .
            Dumper($response->content) . "\n" .
            "Response headers:\n" .
            Dumper($response->headers->as_string)
        } if $response->is_error;

        # When using chunked transfer encoding, occasionally, a chunk gets
        # delayed, and the LWP timeout fires causing the response to only be
        # partially completed. In this case, the X-Died header is set.  If this
        # happens, we retry the request.
        my $x_died = $response->headers->header('X-Died');
        $response = undef if ($x_died && $x_died =~ /read timeout/);
    }
    return $response;
}

1;

