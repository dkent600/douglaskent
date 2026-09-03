/* eslint-disable simple-import-sort/imports -- evaluation order is load-bearing here */

/**
 * The jQuery plugins below attach themselves to the global `jQuery` when they are
 * evaluated, so the global has to be in place first. Keeping them together in one
 * module makes that order explicit and keeps it out of reach of import sorting.
 */
import "./jquery-global";

import "arrive"; // so bmd does it's thing whenever views are attached
import "node-waves";
import "bootstrap-material-design";
