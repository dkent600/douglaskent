import { customElement } from 'aurelia';
import view from './app.html';
import { Resume } from '../resume/resume';
import { route } from '@aurelia/router-lite';

@route({
  routes: [
    {
      path: ['', 'resume/:short?'],
      component: Resume,
      title: 'Douglas Kent',
    },
    {
      path: ['techresume'],
      redirectTo: 'resume',
    },
  ],
  fallback: '',
})
@customElement({
  name: 'app',
  template: view
})
export class App {
  binding() {
    $("#splash").css("display", "none");
  }
}
