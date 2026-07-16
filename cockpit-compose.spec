Name:           cockpit-compose
Version:        %{version}
Release:        1%{?dist}
Summary:        Docker Compose management plugin for Cockpit
License:        MIT
URL:            https://github.com/RXTX4816/cockpit-compose
Source0:        cockpit-compose-%{version}.tar.gz
BuildArch:      noarch
Requires:       cockpit

%description
A Cockpit plugin for managing Docker Compose stacks from the Cockpit web
interface. Start, stop, restart stacks, view live container logs, and edit
compose YAML files with syntax validation.

Requires Docker with the Compose plugin (docker compose v2+). The plugin
is only shown in Cockpit when the docker-compose binary is present.

%prep
%setup -q -n cockpit-compose

%install
install -d %{buildroot}%{_datadir}/cockpit/cockpit-compose
install -m 0644 main.js       %{buildroot}%{_datadir}/cockpit/cockpit-compose/
install -m 0644 main.css      %{buildroot}%{_datadir}/cockpit/cockpit-compose/
install -m 0644 manifest.json %{buildroot}%{_datadir}/cockpit/cockpit-compose/
install -m 0644 index.html    %{buildroot}%{_datadir}/cockpit/cockpit-compose/
cp -r assets                  %{buildroot}%{_datadir}/cockpit/cockpit-compose/

%files
%doc README.md
%{_datadir}/cockpit/cockpit-compose/

%changelog
* Mon May 19 2026 RXTX4816 <RXTX4816@proton.me> - 0.1.0-1
- Initial package
