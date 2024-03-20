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
      path: ['shortresume'],
      redirectTo: 'resume/short',
    }
  ]
})
@customElement({
  name: 'app',
  template: view
})
export class App {
  //   static routes: IRoute[] = [
  //   {
  //     path: ['', 'resume/:short?'],
  //     component: Resume,
  //     title: 'Douglas Kent',
  //   },
  //   {
  //     path: ['shortresume'],
  //     redirectTo: 'resume/short',
  //     title: 'Douglas Kent',
  //   }
  // ];
  binding() {
    $("#splash").css("display", "none");
  }
}
