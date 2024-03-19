import { customElement } from 'aurelia';
import view from './app.html';
import { Resume } from '../resume/resume';
import { IRoute } from '@aurelia/router';

@customElement({
  name: 'app',
  template: view
})
export class App {
    static routes: IRoute[] = [
    {
      path: ['', 'resume/:short?'],
      component: Resume,
      title: 'Douglas Kent',
    },
    {
      path: ['shortresume'],
      redirectTo: 'resume/short',
      title: 'Douglas Kent',
    }
  ];
}