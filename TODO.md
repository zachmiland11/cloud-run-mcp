# TODO

- [ ] Allow configuring transports
- [ ] Do not start local file deploy when running in GCP
- [ ] When running in GCP, use current project, do not accept other projects.
- [ ] Add intermediate progress (Work in progress, see `notifications` branch)
- [ ] Add additional checks for billing account, return link to set up billing
- [ ] Add additional checks for credentials, return clear error message to set them up locally
- [ ] IAM takes time to propagate, add a retry mechanism in case of IAM errors
- [ ] Push to npm
- [ ] Push public image and document how to run via Docker