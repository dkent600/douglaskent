# Douglas Kent Resume

This project is bootstrapped by [aurelia/new](https://github.com/aurelia/new).

## Start dev web server

    npm start

## Build the app in production mode

    npm run build

It builds `dist/*bundle.[hash].js`, updates index.html with hashed js bundle file name. If the code has changed (as opposed to json, html or css), then the hash will change.  So to deploy to the production server, be sure to copy the generated `index.html` and `dist/*`.  Otherwise those files will not have changed and will need not be redeployed.

To deploy everything, copy to production root folder:

```
base.css
favicon.ico
index.html
dist/*
```


## Clear tracing cache

In rare situation, you might need to run clear-cache after upgrading to new version of dumber bundler.

    npm run clear-cache

## index.html

`index.html` is generated from `_index.html` every time `npm run build` runs. It is handled by dumber's `onManifest()` option, check `gulpfile.js` for details.
