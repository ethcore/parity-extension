// Copyright 2015, 2016 Parity Technologies (UK) Ltd.
// This file is part of Parity.

// Parity is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Parity is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Parity.  If not, see <http://www.gnu.org/licenses/>.

import blockies from 'blockies';

import Runner from './runner';
import { FETCH_IMAGE } from '../background/processor';

import styles from './styles.less';

export default class Augmentor {

  static getBadge (badge, height) {
    const { src, title = '' } = badge;

    const image = new Image();

    image.src = src;
    image.title = title.toUpperCase();
    image.className = styles.badge;
    image.style = `height: ${height}px;`;

    return image;
  }

  static getToken (token) {
    const { TLA, balance, name } = token;

    const badge = Augmentor.getBadge(token, 32);
    // Display with 3 decimals
    const value = parseFloat(balance).toFixed(3);

    return `
      <div title="${name}" class="${styles.token}">
        ${badge.outerHTML}
        <div class="${styles.balance}">
          <span class="${styles.value}">${value}</span>
          <span class="${styles.tla}">${TLA}</span>
        </div>
      </div>
    `;
  }

  static getAccountCard (data, icon, badgesData, tokensData) {
    const { address, name } = data;

    const element = document.createElement('div');
    element.className = styles.card;

    // Get the account badges
    const badgesHTML = badgesData.map((badgeData) => {
      const { title } = badgeData;
      const badge = Augmentor.getBadge(badgeData, 24);

      return `
        <div title="${title}" class="${styles.token}">
          ${badge.outerHTML}
          <div class="${styles.balance} ${styles['no-value']}">
            <span class="${styles.tla}">${title}</span>
          </div>
        </div>
      `;
    }).join('');

    // Get the account tokens
    const tokensHTML = tokensData.map((token) => Augmentor.getToken(token)).join('');

    const identityIcon = Augmentor.getBadge({ src: icon, title: address }, 48);
    const nameHTML = name
      ? `<div class="${styles.name}">${name}</div>`
      : '';

    const addressElement = document.createElement('div');
    addressElement.className = styles.address;
    addressElement.title = address;
    addressElement.innerText = address;

    let startedClick = false;
    let doubleClicked = false;
    let clickTimeout = null;

    // Prevent closing on double-click on address (to select it's value)
    addressElement.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const selectedText = window.getSelection().toString();

      doubleClicked = selectedText.length > 0;

      if (startedClick) {
        startedClick = false;
        window.clearTimeout(clickTimeout);
        return false;
      }

      if (doubleClicked) {
        doubleClicked = false;
        return false;
      }

      startedClick = true;

      clickTimeout = window.setTimeout(() => {
        startedClick = false;
        doubleClicked = false;
        addressElement.parentElement.click();
      }, 250);

      return false;
    });

    const title = document.createElement('div');
    title.className = styles.title;
    title.innerHTML = nameHTML;
    title.appendChild(addressElement);

    const header = document.createElement('div');
    header.className = styles.header;
    header.appendChild(identityIcon);
    header.appendChild(title);

    element.innerHTML = `
      <div class="${styles.tokens}">${tokensHTML}</div>
      <div class="${styles.tokens}">${badgesHTML}</div>
    `;

    element.prepend(header);

    return element;
  }

  static augmentNode (key, node, resolved = {}) {
    if (!node || node.getAttribute('data-parity-touched') === 'true') {
      return;
    }

    node.setAttribute('data-parity-touched', true);

    if (!resolved[key]) {
      return;
    }

    const { address, badges = [], tokens = [] } = resolved[key];

    const badgesPromises = badges
      .map((badge) => {
        return Runner.execute(FETCH_IMAGE, badge.img)
          .then((src) => ({ ...badge, src }));
      });

    const tokensPromises = tokens
      .map((token) => {
        return Runner.execute(FETCH_IMAGE, token.img)
          .then((src) => ({ ...token, src }));
      });

    const { height = 16 } = node.getBoundingClientRect();

    const icon = blockies({
      seed: (address || '').toLowerCase(),
      size: 8,
      scale: 8
    }).toDataURL();

    Promise
      .all([ Promise.all(badgesPromises), Promise.all(tokensPromises) ])
      .then(([ badgesData, tokensData ]) => {
        const badgesElements = badgesData.map((badge) => Augmentor.getBadge(badge, height));

        // The Ethereum Addres Identity Icon
        const blockieElement = Augmentor.getBadge({ src: icon, title: address }, height);

        // The Badges container
        const badgesElement = document.createElement('span');
        badgesElement.className = styles.badges;
        badgesElements.forEach((elt) => badgesElement.appendChild(elt));

        // The Account Card
        const cardElement = Augmentor.getAccountCard(resolved[key], icon, badgesData, tokensData);

        // The main Container
        const iconsElement = document.createElement('span');
        iconsElement.setAttribute('data-parity-touched', true);
        iconsElement.className = styles.icons;
        iconsElement.appendChild(blockieElement);
        iconsElement.appendChild(badgesElement);
        iconsElement.appendChild(cardElement);

        iconsElement.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const selectedText = window.getSelection().toString();

          // Don't close if text is selected
          if (selectedText) {
            return false;
          }

          const classes = iconsElement.className.split(' ');

          if (classes.includes(styles.expanded)) {
            iconsElement.className = classes.filter((className) => className !== styles.expanded).join(' ');
          } else {
            iconsElement.className = classes.concat(styles.expanded).join(' ');
          }
        });

        node.className += ` ${styles.container}`;
        node.appendChild(iconsElement);

        const badgesRect = badgesElement.getBoundingClientRect();
        const pageWidth = window.innerWidth;

        // The badges element is scale times 1.5 in CSS transform
        const badgesScale = 1.5;
        const badgesCenter = badgesRect.left + badgesRect.width / 2;
        const scaledBadgesRect = {
          left: badgesCenter - badgesScale * (badgesRect.width / 2),
          right: badgesCenter + badgesScale * (badgesRect.width / 2),
          width: badgesScale * badgesRect.width
        };

        // If 5px or less of right border
        if (scaledBadgesRect.right >= pageWidth - 5) {
          const nextLeft = pageWidth - 5 - scaledBadgesRect.width;
          badgesElement.style.left = `${nextLeft}px`;
        }

        // If 5px of less of left border
        if (scaledBadgesRect.left <= 5) {
          badgesElement.style.left = `5px`;
        }
      });
  }

  static run (matches, resolved = {}) {
    // Use the attributes matcher first
    const attributesMatches = matches.filter((match) => match.from === 'attributes');
    const textMatches = matches.filter((match) => match.from === 'text');

    attributesMatches
      .forEach((match) => {
        const { email, node } = match;
        Augmentor.augmentNode(email, node, resolved);
      });

    textMatches
      .forEach((match) => {
        const { email, node } = match;

        // Safe Node is if the node which inner text is only the email address
        let safeNode = node.innerText.trim() === email
          ? node
          : null;

        // If it has more text, try to separate in SPANs
        if (!safeNode) {
          const emailIndex = node.innerText.indexOf(email);

          if (emailIndex === -1) {
            return;
          }

          const beforeText = node.innerText.slice(0, emailIndex);
          const afterText = node.innerText.slice(emailIndex + email.length);

          node.innerHTML = `${beforeText}<span>${email}</span>${afterText}`;
          safeNode = node.querySelector('span');
        }

        if (!safeNode) {
          return;
        }

        Augmentor.augmentNode(email, safeNode, resolved);
      });
  }

}
