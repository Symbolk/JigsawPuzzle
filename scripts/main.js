'use strict';

const splashPage = document.querySelector('#page-splash');
const signInEmail = document.querySelector('#sign-in-email');
const signUpEmail = document.querySelector('#sign-up-email');
const signInGoogle = document.querySelector('#sign-in-google');
const psResetButton = document.querySelector('#reset-password');
const userPic = document.querySelector('#user-pic');
const userPicThumb = document.querySelector('.user');
const userName = document.querySelector('#user-name');


//SIMULATION
var percentage = 30;
document.querySelector('#progress').addEventListener('mdl-componentupgraded', function () {
    this.MaterialProgress.setProgress(percentage);
    this.MaterialProgress.setBuffer(100 - percentage);
});


var listeningFirebaseRefs = [];
var currentUID; // firebase.auth().currentUser.uid;
var currentUName;
/**
 * click the user icon and show the user profile
 */
(function () {
    let showButton = document.querySelector('#show-user');
    let dialog = document.querySelector('#user-profile');
    let closeButton = document.querySelector('#close-button');
    let signOutButton = document.querySelector('#sign-out-button');

    if (!dialog.showModal) {
        dialogPolyfill.registerDialog(dialog);
    }

    closeButton.addEventListener('click', event => {
        dialog.close();
    });

    showButton.addEventListener('click', event => {
        dialog.showModal();
    });

    signOutButton.addEventListener('click', event => {
        firebase.auth().signOut();
        dialog.close();
    });
}());



/**
 * Clean up the UI and remove all listeners
 */
function cleanUI() {
    listeningFirebaseRefs.forEach(function (ref) {
        ref.off();
    });
    listeningFirebaseRefs = [];
}

Array.prototype.removeByValue = function (val) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] == val) {
            this.splice(i, 1);
            break;
        }
    }
}

/**
 * Write the user profile into the database
 * @param {*} userId 
 * @param {*} name 
 * @param {*} email 
 * @param {*} imageUrl 
 */
function writeUserData(userId, name, email, imageUrl) {
    firebase.database().ref('users/' + userId).set({
    // firebase.database().ref('users/' + name).set({        
        username: name,
        // userid, userId,
        email: email,
        photoURL: imageUrl
    });
}

/**
 * Upload single user's score(steps, time) to the database once he/she figures out
 */
function uploadScore(){
    
}

/**
 *  Triggered by every release and combine
 *  When one link is created by one user: 
 *  1, If the link does not exist, update the tile list of the selected tile and the combined tile;
 *  2, If the link already exists, push(append) the user to the supporter list(child) of the selected tile;
 *  When one link is broken by one user:
 *  1, Remove the user from the supporter list of the 2 tiles;
 *  2, If the user is the last one supporter, remove the link
 * 
 * logs:
 * ++ : add one supporter for the link
 * - : reduce one supporter for the link
 * ++ : new a link and the current user is the first supporter
 * - : remove a link because the current user is the last supporter
 * @param {*} sourceTileIndex the selected tile's index
 * @param {*} aroundTiles the array of the around tiles after release, whose length <= 4
 */
function updateLinks(sourceTileIndex, aroundTiles) {
    // get the around tiles BEFORE release
    let sourceRef = firebase.database().ref('links/' + sourceTileIndex);
    listeningFirebaseRefs.push(sourceRef);
    // linked indexes before this release, whose length <= 4
    let sourceIndexString = sourceTileIndex.toString();
    let lastLinkedIndexes = new Array();
    sourceRef.once('value', snapshot => {
        snapshot.forEach(childSnapshot => {
            let targetIndex = childSnapshot.key;
            if (childSnapshot.child('supporters').hasChild(currentUName)) {
                if (!isNaN(targetIndex)) {
                    lastLinkedIndexes.push(targetIndex);
                }
            }
        });
    }).then(function () {
        sourceRef.once('value', snapshot => {
            // for every tile to be processed
            for (let at of aroundTiles) {
                let targetTileIndex = at.tile.findex;
                let direction = at.direction;

                let targetIndexString = targetTileIndex.toString();
                if (snapshot.hasChild(targetIndexString)) {
                    // if it already exists
                    lastLinkedIndexes.removeByValue(targetIndexString);
                    // supported by others but not current user, so update the link
                    if (!snapshot.child(targetIndexString).child('supporters').hasChild(currentUName)) {
                        console.log('+' + sourceIndexString + '-' + direction + '-' + targetIndexString);
                        let newSupNum = snapshot.child(targetIndexString).val().supNum + 1;
                        let updateLink = {};
                        updateLink['supNum'] = newSupNum;
                        updateLink['supporters/' + currentUName] = direction;
                        if (snapshot.child(targetIndexString).child('opposers').hasChild(currentUName)) {
                            let newOppNum = snapshot.child(targetIndexString).val().oppNum - 1;
                            sourceRef.child(targetIndexString).child('opposers').child(currentUName).remove();
                            updateLink['oppNum'] = newOppNum;
                        }
                        sourceRef.child(targetIndexString).update(updateLink);
                    }
                } else {
                    console.log('++' + sourceIndexString + '-' + direction + '-' + targetIndexString);
                    // not yet supported by any user, so new a link
                    sourceRef.child(targetIndexString).set({
                        target: targetTileIndex,
                        supNum: 1,
                        supporters: {
                            [currentUName]: direction
                        },
                        oppNum: 0
                    });
                }
            }
        }).then(function () {
            // remove links that are not supported by the current user anymore
            sourceRef.once('value').then(snapshot => {
                for (let targetIndex of lastLinkedIndexes) {
                    let targetIndexString = targetIndex.toString();
                    let childRef = sourceRef.child(targetIndexString);
                    listeningFirebaseRefs.push(childRef);
                    let newSupNum = snapshot.child(targetIndexString).val().supNum - 1;
                    let direction = snapshot.child(targetIndexString).val().supporters[currentUName];
                    let newOppNum = snapshot.child(targetIndexString).val().oppNum + 1;

                    console.log('-' + sourceIndexString + '-' + direction + '-' + targetIndexString);
                    let updateLink = {};
                    childRef.child('supporters').child(currentUName).remove();
                    updateLink['supNum'] = newSupNum;
                    updateLink['oppNum'] = newOppNum;
                    updateLink['opposers/' + currentUName] = direction;
                    childRef.update(updateLink);

                    let targetRef = firebase.database().ref('links/' + targetIndexString);
                    listeningFirebaseRefs.push(targetRef);
                    targetRef.once('value').then(snapshot => {
                        let childRef = targetRef.child(sourceIndexString);
                        listeningFirebaseRefs.push(childRef);
                        if (snapshot.child(sourceIndexString).child('supporters').hasChild(currentUName)) {
                            let newSupNum = snapshot.child(sourceIndexString).val().supNum - 1;
                            let newOppNum = snapshot.child(sourceIndexString).val().oppNum + 1;
                            console.log('-' + targetIndexString + '-' + direction + '-' + sourceIndexString);
                            let updateLink = {};
                            childRef.child('supporters').child(currentUName).remove();
                            updateLink['supNum'] = newSupNum;
                            updateLink['oppNum'] = newOppNum;
                            updateLink['opposers/' + currentUName] = direction;
                            childRef.update(updateLink);
                        }
                    });
                }
            });
        });

        // update bidirectionally in the targets side
        for (let at of aroundTiles) {
            let targetIndex = at.tile.findex;
            // get the opposite direction(target relative to the source)
            let direction = at.direction;
            switch (at.direction) {
                case 'L':
                    direction = 'R';
                    break;
                case 'R':
                    direction = 'L';
                    break;
                case 'T':
                    direction = 'B';
                    break;
                case 'B':
                    direction = 'T';
                    break;
                default:
                    break;
            }

            let targetIndexString = targetIndex.toString();
            let targetRef = firebase.database().ref('links/' + targetIndexString);
            listeningFirebaseRefs.push(targetRef);
            targetRef.once('value', snapshot => {
                if (snapshot.hasChild(sourceIndexString)) {
                    if (!snapshot.child(sourceIndexString).child('supporters').hasChild(currentUName)) {
                        console.log('+' + targetIndexString + '-' + direction + '-' + sourceIndexString);
                        let newSupNum = snapshot.child(sourceIndexString).val().supNum + 1;
                        let updateLink = {};
                        updateLink['supNum'] = newSupNum;
                        updateLink['supporters/' + currentUName] = direction;
                        if (snapshot.child(sourceIndexString).child('opposers').hasChild(currentUName)) {
                            let newOppNum = snapshot.child(sourceIndexString).val().oppNum - 1;
                            targetRef.child(sourceIndexString).child('opposers').child(currentUName).remove();
                            updateLink['oppNum'] = newOppNum;
                        }
                        targetRef.child(sourceIndexString).update(updateLink);
                    }
                } else {
                    console.log('++' + targetIndexString + '-' + direction + '-' + sourceIndexString);
                    targetRef.child(sourceIndexString).set({
                        target: sourceTileIndex,
                        supNum: 1,
                        supporters: {
                            [currentUName]: direction
                        },
                        oppNum: 0
                    });
                }
            });
        }
    });

}


/**
 * Remove all supporting links if the use pick and release the tile in an empty place
 * remove bidirectionaly
 * @param {*} sourceTileIndex 
 * @param {*} aroundTileIndexes 
 */
function removeLinks(sourceTileIndex) {
    // get the around tiles BEFORE release
    let sourceRef = firebase.database().ref('links/' + sourceTileIndex);
    listeningFirebaseRefs.push(sourceRef);
    sourceRef.once('value').then(snapshot => {
        snapshot.forEach(childSnapshot => {
            let targetIndex = childSnapshot.key;
            if (childSnapshot.child('supporters').hasChild(currentUName)) {
                // if(Number.isInteger(targetIndex)){
                if (!isNaN(targetIndex)) {
                    // remove and upade the links around the current tile
                    sourceRef.once('value').then(snapshot => {
                        let childRef = sourceRef.child(targetIndex);
                        listeningFirebaseRefs.push(childRef);
                        let newSupNum = snapshot.child(targetIndex).val().supNum - 1;
                        let direction = snapshot.child(targetIndex).val().supporters[currentUName];
                        let newOppNum = snapshot.child(targetIndex).val().oppNum + 1;
                        let updateLink = {};
                        childRef.child('supporters').child(currentUName).remove();
                        updateLink['supNum'] = newSupNum;
                        updateLink['oppNum'] = newOppNum;
                        updateLink['opposers/' + currentUName] = direction;
                        childRef.update(updateLink);
                    });
                    // also update the links from the current tile to the target tiles
                    let targetRef = firebase.database().ref('links/' + targetIndex);
                    listeningFirebaseRefs.push(targetRef);
                    targetRef.once('value').then(snapshot => {
                        let childRef = targetRef.child(sourceTileIndex);
                        if (snapshot.child(sourceTileIndex).child('supporters').hasChild(currentUName)) {
                            let newSupNum = snapshot.child(sourceTileIndex).val().supNum - 1;
                            let newOppNum = snapshot.child(sourceTileIndex).val().oppNum + 1;
                            let direction = snapshot.child(sourceTileIndex).val().supporters[currentUName];
                            let updateLink = {};
                            childRef.child('supporters').child(currentUName).remove();
                            updateLink['supNum'] = newSupNum;
                            updateLink['oppNum'] = newOppNum;
                            updateLink['opposers/' + currentUName] = direction;
                            childRef.update(updateLink);
                        }
                    });
                }
            }
        });
    });
}

/**
 * Recommend 1~4 tiles for the current user 
 * Current recommendation algorithm:
 * 1, get the selected tile's link list
 * 2, order the link list by supNum
 * 3, for the top n links, get their most possible directions from the supporters list
 * 4, attach the recommended tiles to the selected tile
 * @param {*} selectedTileIndex 
 * @param {*} n 
 */

function getHints(selectedTileIndex, n) {
    let tilesRef = firebase.database().ref('links/' + selectedTileIndex);
    tilesRef.once('value', snapshot => {
        snapshot.forEach(childSnapshot => {
            // let score = childSnapshot.val().supNum / (childSnapshot.val().supNum + childSnapshot.val().oppNum);
            let score = childSnapshot.val().supNum;
            let updateScore = {};
            updateScore['score'] = score;
            tilesRef.child(childSnapshot.key).update(updateScore);
        });
    });

    let topTilesRef = tilesRef.orderByChild('score');// ascending order     
    let topNTilesRef = topTilesRef.limitToLast(n);
    listeningFirebaseRefs.push(topTilesRef);
    listeningFirebaseRefs.push(topNTilesRef);
    // console.trace();
    return new Promise((resolve, reject) => {
        let results = [];
        topNTilesRef.once('value').then(snapshot => {
            snapshot.forEach(childSnapshot => {
                // use the most supported direction as the hint direction
                let counter= []; // key : value = direction : time
                let supporters = childSnapshot.val().supporters;
                for (let key in supporters) {
                    if (supporters.hasOwnProperty(key)) {
                        let d = supporters[key];
                        if(isNaN(counter[d])){
                            counter[d]=1;
                        }else{
                            counter[d]+=1;
                        }
                    }
                }
                let hintDirection=undefined; // require one supporter at least
                for (let key in counter) {
                    if (counter.hasOwnProperty(key)) { 
                        if(hintDirection==undefined){
                            hintDirection=key;
                        }else{
                            if(counter[key] > counter[hintDirection]){
                                hintDirection=key;
                            }
                        }
                    }
                }
                // push the hint results into the array
                results.push({
                    index: childSnapshot.key,
                    score: childSnapshot.val().score,
                    direction: hintDirection
                });
            });
            if (results.length > 0) {
                resolve(results);
            } else {
                reject('NO results.');
            }
        });
    });
}


/**
 * Initialize the timer: reset and start it once the user signs in 
 * @param {*} timer 
 */
let hour, minute, second, t;
let timer = document.querySelector('#timer');
function initTimer() {
    timer.innerHTML = "00:00:00";
    hour = minute = second = 0;
    startIt();
}
function startIt() {
    second++;
    if (second >= 60) {
        second = 0;
        minute++;
    }
    if (minute >= 60) {
        minute = 0;
        hour++;
    }
    timer.innerHTML = judge(hour) + ":" + judge(minute) + ":" + judge(second);
    t = setTimeout("startIt()", 1000);
}
function judge(arg) {
    return arg >= 10 ? arg : "0" + arg;
}
/**
 *  Bind event handlers for the show_steps and show_time switch
 */
document.querySelector('#show_steps').addEventListener('click', function () {
    $('#steps_chip').fadeToggle('slow');
});
document.querySelector('#show_timer').addEventListener('click', function () {
    $('#timer_chip').fadeToggle('slow');
});

/**
 * Track the user state change
 * @param {*} user 
 */
function onAuthStateChanged(user) {
    if (user && currentUID === user.uid) {
        initTimer();
        // initialize the database which keeps the links
        // initDatabase(64);
        return;
    }
    cleanUI();
    if (user) {
        // user is signed in
        currentUID = user.uid;
        currentUName = user.displayName || (user.email.toString().split('.')[0]);
        splashPage.style.display = 'none';
        let defaultPic = '../images/user.png';
        let photoURL = user.photoURL || defaultPic;
        writeUserData(user.uid, user.displayName, user.email, photoURL);
        userName.textContent = currentUName;
        userPic.src = (user.photoURL || defaultPic);
        userPicThumb.src = (user.photoURL || defaultPic);
        initTimer();
        // initialize the database which keeps the links
        // initDatabase(64);
    } else {
        currentUID = null;
        splashPage.style.display = '';
    }
}

function checkEmail(email) {
    const pattern = /^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+\.[a-zA-Z]{2,3}$/;
    if (pattern.test(email.value)) {
        email.style.color = "green";
        return true;
    } else {
        // email.style.color = "red";
        return false;
    }
}

function signInWithEmail() {
    if (firebase.auth().currentUser) {
        firebase.auth().signOut();
    } else {
        let email = document.getElementById('email');
        let password = document.getElementById('password');
        if (!checkEmail(email)) {
            alert('邮箱格式不正确！');
            email.focus();
            signInEmail.disabled = false;
            return;
        }
        if (password.value.length < 3) {
            alert('请输入密码！');
            return;
        }

        firebase.auth().signInWithEmailAndPassword(email.value, password.value).catch(error => {
            if (error.code === 'auth/wrong-password') {
                alert('密码错误！');
            } else if (error.code == 'auth/user-not-found') {
                alert('用户不存在！');
            } else {
                alert(error.message);
                console.log(error);
            }
            signInEmail.disabled = false;
        });
    }
    signInEmail.disabled = true;
}

function sendPSResetEmail() {
    let email = document.getElementById('email');
    // [START sendpasswordemail]
    firebase.auth().sendPasswordResetEmail(email.value).then(function () {
        // Password Reset Email Sent!
        // [START_EXCLUDE]
        alert('密码重置邮件已发送！');
        // [END_EXCLUDE]
    }).catch(function (error) {
        // Handle Errors here.
        let errorCode = error.code;
        let errorMessage = error.message;
        // [START_EXCLUDE]
        if (errorCode == 'auth/invalid-email') {
            alert('邮箱格式不正确！');
        } else if (errorCode == 'auth/user-not-found') {
            alert('用户不存在！');
        } else {
            alert(errorMessage);
            console.log(error);
        }
        // [END_EXCLUDE]
    });
    // [END sendpasswordemail];
}

function handleSignUp() {
    let email = document.getElementById('email');
    let password = document.getElementById('password');
    if (!checkEmail(email)) {
        alert('邮箱格式不正确！');
        email.focus();
        signInEmail.disabled = false;
        return;
    }
    if (password.value.length < 3) {
        alert('请输入密码！');
        return;
    }
    // Sign in with email and pass.
    // [START createwithemail]
    firebase.auth().createUserWithEmailAndPassword(email.value, password.value).catch(function (error) {
        // Handle Errors here.
        let errorCode = error.code;
        let errorMessage = error.message;
        // [START_EXCLUDE]
        if (errorCode == 'auth/weak-password') {
            alert('密码太弱！');
        } else {
            alert(errorMessage);
        }
        console.log(error);
        // [END_EXCLUDE]
    }).then(function () {
        alert('注册成功，但邮箱未验证！');
    });
    // [END createwithemail]
}

function bindEnter(event) {
    if (event.keyCode == 13) {
        signInEmail.click();
    }
}

window.addEventListener('load', function () {
    firebase.auth().onAuthStateChanged(onAuthStateChanged);
    signInGoogle.addEventListener('click', function () {
        let provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider);
    });

    signInEmail.addEventListener('click', signInWithEmail, false);
    signUpEmail.addEventListener('click', handleSignUp, false);
    psResetButton.addEventListener('click', sendPSResetEmail, false);
    signInEmail.disabled = false;
}, false);