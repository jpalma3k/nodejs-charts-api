# Portal DMO

New portal with per user access and bussiness modules permissions.

## Getting Started
 
Server side, or backend is developed in NodeJS.
This backend has 3 main core functional asbtraction modules regarding its requirements:
- Database Access Layer
- Mail Sender 
- Authentication Module
Also its uses a JSON logger with pre defined logical outputs: debug, info and error.

## Built With (Technologies and Dependecies)

* [NodeJS >= 14.4.0](https://nodejs.org/) - The JavaScript runtime built on Chrome's V8 JavaScript engine.
* [ExpressJS](https://expressjs.com/) -  The fast, unopinionated, minimalist web framework for NodeJS.


Aditional dependencies can be viewed by inspecting the package.json file.

However, the most important ones are: bunya (for logging), oracledb (database access) and Oauth (authentication).

Aditional note: oracledb requires instant client which is already bundle in this process and append to the head of PATH env variable to work.

## Installing

To get a development env running:

- 1 Create an .env file in project directory using the .env.example as template

- 2 In project directory:
```batch
npm install
```
- 3 Run project
```batch
npm run serve
npm run build / ng build
```
NOTE: some folders maybe need to be created upfront. ./log for logging and ./public for serving static content.

## Running the tests

- For now there are no automated tests for this system.
- However one should test each new developed module API with some restfull test suite.

## Development

The purpose of this backend server project is to provide core functionalities and bussiness modules according to each modules specific requirements. Since the main architecture is a server <-> client model the whole server modules should implement a stateless structure to process all the requests to its available endpoints.
Also, in order to accomplish good overall core/modules readability and architecture understanding, the developing modules should follow a stateless layered facade patern:
- (request) -> [endpoint facade layer] -> [bussiness logic layer] --> [data access layer] 
- (response) <- [endpoint facade layer] <- [bussiness logic layer] <-- [data access layer] 

These key features makes future improvements and development and maintenance easier due to follow similar underlying principles.
Futhermore, one should evaluate if new developed functionalities could benefit future or already existing modules, creating and moving those to core. 

## Deployment

When deploying this backend to production we should not forget to correctly configure its environment variables in .env file. One of the most important setting is setting NODE_ENV to production as tests indicate that just doing this can improve app performance by a factor of three!
For more information regarding this concern:
* [Production best practices: performance and reliability](https://expressjs.com/en/advanced/best-practice-performance.html)

## Versioning

This project uses git as version control. Its is advised to create a new branch for each new development.
Each one of these development branches should follow the following order regarding version control merges:

branch --> master/development --> staging --> production

It is also important one should not forget to well use version TAGs for production brach at least.
PS: always check and DO NOT commit any .env file or other files that may or can contain credentials.
