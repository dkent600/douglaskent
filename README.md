# Douglas Kent Resume

This project is bootstrapped by [aurelia/new](https://github.com/aurelia/new).

## Start dev web server

    npm start

## Build the app in production mode

    npm run build

It builds `dist/*bundle.[hash].js`, updates index.html with hashed js bundle file name.  then the hash will change.  So to deploy to the production server, be sure to copy the generated `index.html` and `dist/*`.  Otherwise those files will not have changed and will need not be redeployed.

To deploy everything, copy to production root folder:

```
base.css
favicon.ico
dist/index.html
dist/assets
```


## Clear tracing cache

In rare situation, you might need to run clear-cache after upgrading to new version of dumber bundler.

    npm run clear-cache

## index.html

`dist/index.html` is generated from `index.html` every time `npm run build` runs.

## App data flow

There is a certain flow in the app in terms of how the UI gets data delivered to it. The views communicate with stores and the stores communicate with services.

- Views are the UI of the app. Stores are injected into the views and the views can call data from the stores. Views are supposed to be in charge of any formatting of data on the UI. (currency, numbers, strings, etc.)
- Stores are the middle layer between the view (UI) and the services (Backend). Services are injected into stores and stores call the services needed to retrieve the data. Stores are also where the business logic (any data alteration needed) and data caching reside.
- Services are the back end of the app that actually call the contracts and databases. This is the layer that returns the raw data from external services (contracts/firebase/etc.)
