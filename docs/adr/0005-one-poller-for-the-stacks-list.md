# One poller for the stacks list

Every row of the stacks list used to read its own containers and stats on its own 10-second timer, so a page of N stacks cost N container reads and N stats reads per interval, each one a request to the engine (or a process on the CLI path). `StacksLiveProvider` asks the engine once for every compose project's containers (`listAllStackContainers`) and once for the stats of all running ones, and hands each stack its share through `useStackLive`.

A row waits for the shared read while it has not failed. The shared read is the engine's REST API only, because no single CLI call returns the same shape on Docker and Podman; when the socket cannot be used it rejects, the provider reports it as unavailable, and every row reads for itself exactly as before. The cost of that choice is two code paths in `useContainerStats`; the benefit is that the common setup does one read where it did N, and a setup without a usable socket is no worse off.
