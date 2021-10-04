package MusicBrainz::Server::Controller::Role::Profile;
use MooseX::MethodAttributes::Role;
use MooseX::Role::Parameterized;

parameter 'threshold' => (
    required => 1,
    default => 0
);

role {
    my $params = shift;
    my $threshold = $params->threshold;

    requires 'begin', 'end';

    if ($threshold > 0) {
        after 'begin' => sub {
            my ($self, $c) = @_;
            $c->stats->profile(begin => 'request');
        };

        after 'end' => sub {
            my ($self, $c) = @_;
            $c->stats->profile(end => 'request');

            for my $stat ($c->stats->report) {
                my ($depth, $name, $duration) = @$stat;
                if ($name eq 'request' && $duration > $threshold) {
                    $c->log->warn(
                        sprintf('Slow request (%.3fs): %s %s', $duration, $c->req->method, $c->req->uri)
                    );
                }
            }
        };
    }
};

1;
