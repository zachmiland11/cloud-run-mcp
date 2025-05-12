# TODO

- [ ] Add intermediate progress (Work in progress, see `notifications` branch)
- [ ] Add additional checks for billing account, return link to set up billing
- [ ] IAM takes time to propagate, add a retry mechanism in case of IAM errors
- [ ] Potentially add an option to disable project creation
- [ ] Do not use Cloud Billing as required API, only do so if creating a new project
- [ ] re-evaluate adding stdio transport
- [ ] Allow configuring transports?
- [ ] When running as remote, add an option to use some kind of simple `KEY` header.
- [ ] Push to npm
- [ ] Push public image and document how to run via Docker
- [ ] Do a dry run when deploying Cloud Run service and if invoker_iam_disabled is not allowed, deploy without it.