package MusicBrainz::Server::Controller::WS::js::Label;
use Moose;
use MooseX::MethodAttributes;
use namespace::autoclean;

extends 'MusicBrainz::Server::ControllerBase::WS::js';

with 'MusicBrainz::Server::Controller::WS::js::Role::Autocompletion';
with 'MusicBrainz::Server::Controller::WS::js::Role::Autocompletion::PrimaryAlias' => {
    model => 'Label',
};

my $ws_defs = Data::OptList::mkopt([
    'label' => {
        method   => 'GET',
        required => [ qw(q) ],
        optional => [ qw(advanced direct limit page timestamp) ],
    },
]);

with 'MusicBrainz::Server::WebService::Validator' =>
{
     defs => $ws_defs,
     version => 'js',
     default_serialization_type => 'json',
};

sub type { 'label' }

sub search : Chained('root') PathPart('label')
{
    my ($self, $c) = @_;
    $self->dispatch_search($c);
}

after _load_entities => sub {
    my ($self, $c, @entities) = @_;
    $c->model('LabelType')->load(@entities);
};

1;
